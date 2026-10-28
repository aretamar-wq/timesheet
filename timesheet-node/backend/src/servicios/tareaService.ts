import { consultar, contiene, ejecutar, esDuplicado, existe, pool, primero, type Ejecutor } from '../db.js';
import { condicionEstado, type FiltroEstado } from '../dominio/constantes.js';
import { ReglaNegocioError } from '../errores.js';
import { comoNumeroGlpi, filtrosWhere, texto } from './comun.js';

/**
 * Una tarea es un ticket GLPI: solo existe en proyectos que se cargan por ticket (pro_usa_glpi), siempre tiene
 * número de GLPI y ese número es único dentro del proyecto (también contra tareas dadas de baja).
 */

const LARGO_MAXIMO_NOMBRE = 200;

export interface Tarea {
  id: number;
  proyectoId: number;
  nombre: string;
  glpi: number;
  activo: boolean;
}

export interface OpcionTarea {
  id: number;
  nombre: string;
  glpi: number;
}

export interface TareaListado extends Tarea {
  proyecto: string;
  proyectoActivo: boolean;
  /** Total de horas cargadas, o null si no tiene. */
  horas: number | null;
}

/** Tareas activas de un proyecto, para el desplegable de carga de horas. */
export function activas(proyectoId: number): Promise<OpcionTarea[]> {
  return consultar<OpcionTarea>(
    pool,
    `SELECT tar_id AS id, tar_nombre AS nombre, tar_glpi AS glpi
       FROM Tareas
      WHERE tar_pro = ? AND tar_activo = 1
      ORDER BY tar_nombre`,
    [proyectoId],
  );
}

/**
 * Listado del ABM. El texto busca en la descripción y, si es un número, también el GLPI exacto.
 * Ordenado por GLPI descendente (tickets más nuevos primero).
 */
export function listar(
  filtroTexto: string | undefined,
  proyectoId: number | undefined,
  estado: FiltroEstado,
): Promise<TareaListado[]> {
  const condiciones: string[] = [];
  const parametros: unknown[] = [];
  if (filtroTexto) {
    const numero = comoNumeroGlpi(filtroTexto);
    if (numero !== undefined) {
      condiciones.push('(t.tar_glpi = ? OR t.tar_nombre LIKE ?)');
      parametros.push(numero, contiene(filtroTexto));
    } else {
      condiciones.push('t.tar_nombre LIKE ?');
      parametros.push(contiene(filtroTexto));
    }
  }
  if (proyectoId !== undefined) {
    condiciones.push('t.tar_pro = ?');
    parametros.push(proyectoId);
  }
  const porEstado = condicionEstado('t.tar_activo', estado);
  if (porEstado) condiciones.push(porEstado);

  return consultar<TareaListado>(
    pool,
    `SELECT t.tar_id AS id, t.tar_pro AS proyectoId, t.tar_nombre AS nombre, t.tar_glpi AS glpi,
            t.tar_activo AS activo, p.pro_nombre AS proyecto, p.pro_activo AS proyectoActivo,
            (SELECT SUM(ti.tie_duracion) FROM Tiempo ti WHERE ti.tie_tar = t.tar_id) AS horas
       FROM Tareas t JOIN Proyectos p ON p.pro_id = t.tar_pro
      ${filtrosWhere(condiciones)}
      ORDER BY t.tar_glpi DESC`,
    parametros,
  );
}

/** Total de horas cargadas contra la tarea, o null si no tiene. */
export async function horasCargadas(id: number): Promise<number | null> {
  const fila = await primero<{ horas: number | null }>(
    pool,
    'SELECT SUM(tie_duracion) AS horas FROM Tiempo WHERE tie_tar = ?',
    [id],
  );
  return fila?.horas ?? null;
}

export function obtener(id: number, ej: Ejecutor = pool): Promise<Tarea | undefined> {
  return primero<Tarea>(
    ej,
    `SELECT tar_id AS id, tar_pro AS proyectoId, tar_nombre AS nombre, tar_glpi AS glpi, tar_activo AS activo
       FROM Tareas WHERE tar_id = ?`,
    [id],
  );
}

export interface DatosTarea {
  proyectoId: number | undefined;
  nombre: unknown;
  glpi: number | undefined;
}

interface ProyectoDeTarea {
  id: number;
  nombre: string;
  usaGlpi: boolean;
  activo: boolean;
}

/** Crea (id = 0) o modifica una tarea desde el ABM y devuelve su id. No cambia el estado activo. */
export async function guardar(id: number, datos: DatosTarea): Promise<number> {
  let actual: Tarea | undefined;
  if (id !== 0) {
    actual = await obtener(id);
    if (!actual) throw new ReglaNegocioError('La tarea no existe.');
  }

  const { nombre, glpi, proyecto } = await validar(datos);

  // El proyecto debe estar activo, salvo que sea el que la tarea ya tenía.
  if (!proyecto.activo && actual?.proyectoId !== proyecto.id) {
    throw new ReglaNegocioError(`El proyecto "${proyecto.nombre}" está dado de baja.`);
  }

  // Las horas cargadas referencian (tarea, proyecto): una tarea con horas no puede cambiar de proyecto.
  if (actual && actual.proyectoId !== proyecto.id &&
      await existe(pool, 'SELECT 1 FROM Tiempo WHERE tie_tar = ? LIMIT 1', [id])) {
    throw new ReglaNegocioError('La tarea tiene horas cargadas: no se puede mover a otro proyecto.');
  }

  await validarGlpiUnico(id, proyecto.id, glpi);

  try {
    if (!actual) {
      const resultado = await ejecutar(
        pool,
        'INSERT INTO Tareas (tar_pro, tar_nombre, tar_glpi) VALUES (?, ?, ?)',
        [proyecto.id, nombre, glpi],
      );
      return resultado.insertId;
    }
    await ejecutar(
      pool,
      'UPDATE Tareas SET tar_pro = ?, tar_nombre = ?, tar_glpi = ? WHERE tar_id = ?',
      [proyecto.id, nombre, glpi, id],
    );
    return id;
  } catch (error) {
    // Carrera contra UQ_Tareas_pro_glpi.
    if (esDuplicado(error)) throw new ReglaNegocioError(`Ya existe una tarea con el GLPI ${glpi} en el proyecto.`);
    throw error;
  }
}

/**
 * Baja lógica (activo = false) o reactivación. Las horas cargadas no se modifican.
 * Para reactivar, el proyecto tiene que seguir cargándose por ticket GLPI.
 */
export async function cambiarEstado(id: number, activo: boolean): Promise<void> {
  const tarea = await primero<{ proyecto: string; usaGlpi: boolean }>(
    pool,
    `SELECT p.pro_nombre AS proyecto, p.pro_usa_glpi AS usaGlpi
       FROM Tareas t JOIN Proyectos p ON p.pro_id = t.tar_pro
      WHERE t.tar_id = ?`,
    [id],
  );
  if (!tarea) throw new ReglaNegocioError('La tarea no existe.');
  if (activo && !tarea.usaGlpi) {
    throw new ReglaNegocioError(
      `No se puede reactivar: el proyecto "${tarea.proyecto}" ya no se carga por ticket GLPI.`,
    );
  }
  await ejecutar(pool, 'UPDATE Tareas SET tar_activo = ? WHERE tar_id = ?', [activo, id]);
}

export interface ResultadoAltaTarea {
  tarea: OpcionTarea;
  /** true si no se creó porque ya existía una tarea activa con el mismo GLPI en el proyecto. */
  yaExistia: boolean;
}

/**
 * Alta rápida de una tarea desde la pantalla de carga de horas (disponible para cualquier usuario con CARGA_HORAS).
 * Si ya existe una tarea activa con el mismo GLPI en el proyecto, la devuelve en lugar de duplicarla.
 */
export async function crearDesdeCarga(datos: DatosTarea): Promise<ResultadoAltaTarea> {
  if (datos.glpi === undefined) throw new ReglaNegocioError('El número de ticket GLPI es obligatorio.');

  const { nombre, glpi, proyecto } = await validar(datos);
  if (!proyecto.activo) throw new ReglaNegocioError('El proyecto no existe o está dado de baja.');

  const existente = await primero<OpcionTarea>(
    pool,
    `SELECT tar_id AS id, tar_nombre AS nombre, tar_glpi AS glpi
       FROM Tareas WHERE tar_pro = ? AND tar_activo = 1 AND tar_glpi = ?`,
    [proyecto.id, glpi],
  );
  if (existente) return { tarea: existente, yaExistia: true };
  await validarGlpiUnico(0, proyecto.id, glpi);   // cubre el caso de una tarea con ese GLPI dada de baja

  try {
    const resultado = await ejecutar(
      pool,
      'INSERT INTO Tareas (tar_pro, tar_nombre, tar_glpi) VALUES (?, ?, ?)',
      [proyecto.id, nombre, glpi],
    );
    return { tarea: { id: resultado.insertId, nombre, glpi }, yaExistia: false };
  } catch (error) {
    if (esDuplicado(error)) throw new ReglaNegocioError(`Ya existe una tarea con el GLPI ${glpi} en el proyecto.`);
    throw error;
  }
}

/** Descripción, GLPI y proyecto (regla 3: solo proyectos que se cargan por ticket GLPI tienen tareas). */
async function validar(datos: DatosTarea): Promise<{ nombre: string; glpi: number; proyecto: ProyectoDeTarea }> {
  const nombre = texto(datos.nombre);
  if (!nombre) throw new ReglaNegocioError('La descripción de la tarea es obligatoria.');
  if (nombre.length > LARGO_MAXIMO_NOMBRE) {
    throw new ReglaNegocioError(`La descripción de la tarea no puede superar los ${LARGO_MAXIMO_NOMBRE} caracteres.`);
  }
  const glpi = datos.glpi;
  if (glpi === undefined || !Number.isInteger(glpi) || glpi <= 0 || glpi > 2_147_483_647) {
    throw new ReglaNegocioError('El número de ticket GLPI debe ser un entero positivo.');
  }

  const proyecto = datos.proyectoId === undefined
    ? undefined
    : await primero<ProyectoDeTarea>(
        pool,
        'SELECT pro_id AS id, pro_nombre AS nombre, pro_usa_glpi AS usaGlpi, pro_activo AS activo FROM Proyectos WHERE pro_id = ?',
        [datos.proyectoId],
      );
  if (!proyecto) throw new ReglaNegocioError('Seleccione un proyecto.');
  if (!proyecto.usaGlpi) {
    throw new ReglaNegocioError(`El proyecto "${proyecto.nombre}" no se carga por ticket GLPI: no admite tareas.`);
  }
  return { nombre, glpi, proyecto };
}

/** El GLPI es único dentro del proyecto, contando también las tareas dadas de baja. */
async function validarGlpiUnico(id: number, proyectoId: number, glpi: number): Promise<void> {
  const otra = await primero<{ nombre: string; activo: boolean }>(
    pool,
    'SELECT tar_nombre AS nombre, tar_activo AS activo FROM Tareas WHERE tar_pro = ? AND tar_glpi = ? AND tar_id <> ?',
    [proyectoId, glpi, id],
  );
  if (!otra) return;
  if (otra.activo) {
    throw new ReglaNegocioError(`Ya existe la tarea "${otra.nombre}" con el GLPI ${glpi} en este proyecto.`);
  }
  throw new ReglaNegocioError(
    `El GLPI ${glpi} ya está en este proyecto en la tarea "${otra.nombre}", dada de baja. ` +
      'Hay que reactivarla desde el ABM de Tareas.',
  );
}
