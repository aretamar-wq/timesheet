import { consultar, contiene, ejecutar, esDuplicado, existe, pool, primero } from '../db.js';
import { condicionEstado, type FiltroEstado } from '../dominio/constantes.js';
import { ReglaNegocioError } from '../errores.js';
import { filtrosWhere, texto } from './comun.js';

const LARGO_MAXIMO_NOMBRE = 150;

export interface Proyecto {
  id: number;
  nombre: string;
  categoriaId: number;
  usaGlpi: boolean;
  activo: boolean;
}

export interface OpcionProyecto extends Proyecto {
  categoria: string;
}

export interface ProyectoListado extends OpcionProyecto {
  categoriaActiva: boolean;
  tareasActivas: number;
}

const COLUMNAS_OPCION = `p.pro_id AS id, p.pro_nombre AS nombre, p.pro_cat AS categoriaId, c.cat_nombre AS categoria,
                         p.pro_usa_glpi AS usaGlpi, p.pro_activo AS activo`;

/** Proyectos activos para los desplegables de carga de horas, ordenados por categoría y nombre. */
export function activos(): Promise<OpcionProyecto[]> {
  return consultar<OpcionProyecto>(
    pool,
    `SELECT ${COLUMNAS_OPCION}
       FROM Proyectos p JOIN Categorias c ON c.cat_id = p.pro_cat
      WHERE p.pro_activo = 1
      ORDER BY c.cat_nombre, p.pro_nombre`,
  );
}

/**
 * Proyectos que se cargan por ticket GLPI (los únicos que admiten tareas), para desplegables del ABM de Tareas.
 * Sin incluirInactivos solo devuelve activos, más el indicado en incluirId (el proyecto actual de la tarea).
 */
export function porTicket(incluirInactivos: boolean, incluirId?: number): Promise<OpcionProyecto[]> {
  return consultar<OpcionProyecto>(
    pool,
    `SELECT ${COLUMNAS_OPCION}
       FROM Proyectos p JOIN Categorias c ON c.cat_id = p.pro_cat
      WHERE p.pro_usa_glpi = 1 AND (? OR p.pro_activo = 1 OR p.pro_id = ?)
      ORDER BY p.pro_nombre`,
    [incluirInactivos, incluirId ?? 0],
  );
}

/** Listado del ABM con filtros opcionales por texto (nombre), categoría y estado. */
export function listar(
  filtroTexto: string | undefined,
  categoriaId: number | undefined,
  estado: FiltroEstado,
): Promise<ProyectoListado[]> {
  const condiciones: string[] = [];
  const parametros: unknown[] = [];
  if (filtroTexto) {
    condiciones.push('p.pro_nombre LIKE ?');
    parametros.push(contiene(filtroTexto));
  }
  if (categoriaId !== undefined) {
    condiciones.push('p.pro_cat = ?');
    parametros.push(categoriaId);
  }
  const porEstado = condicionEstado('p.pro_activo', estado);
  if (porEstado) condiciones.push(porEstado);

  return consultar<ProyectoListado>(
    pool,
    `SELECT ${COLUMNAS_OPCION}, c.cat_activo AS categoriaActiva,
            (SELECT COUNT(*) FROM Tareas t WHERE t.tar_pro = p.pro_id AND t.tar_activo = 1) AS tareasActivas
       FROM Proyectos p JOIN Categorias c ON c.cat_id = p.pro_cat
      ${filtrosWhere(condiciones)}
      ORDER BY p.pro_nombre`,
    parametros,
  );
}

export function obtener(id: number): Promise<Proyecto | undefined> {
  return primero<Proyecto>(
    pool,
    `SELECT pro_id AS id, pro_nombre AS nombre, pro_cat AS categoriaId, pro_usa_glpi AS usaGlpi, pro_activo AS activo
       FROM Proyectos WHERE pro_id = ?`,
    [id],
  );
}

export interface DatosProyecto {
  nombre: unknown;
  categoriaId: number | undefined;
  usaGlpi: boolean;
}

/** Crea (id = 0) o modifica un proyecto y devuelve su id. No cambia el estado activo (ver cambiarEstado). */
export async function guardar(id: number, datos: DatosProyecto): Promise<number> {
  const nombre = texto(datos.nombre);
  if (!nombre) throw new ReglaNegocioError('El nombre del proyecto es obligatorio.');
  if (nombre.length > LARGO_MAXIMO_NOMBRE) {
    throw new ReglaNegocioError(`El nombre del proyecto no puede superar los ${LARGO_MAXIMO_NOMBRE} caracteres.`);
  }
  const duplicado = `Ya existe un proyecto con el nombre "${nombre}".`;

  if (await existe(pool, 'SELECT 1 FROM Proyectos WHERE pro_nombre = ? AND pro_id <> ?', [nombre, id])) {
    throw new ReglaNegocioError(duplicado);
  }

  let actual: Proyecto | undefined;
  if (id !== 0) {
    actual = await obtener(id);
    if (!actual) throw new ReglaNegocioError('El proyecto no existe.');
  }

  // La categoría debe estar activa, salvo que sea la que el proyecto ya tenía.
  const categoria = datos.categoriaId === undefined
    ? undefined
    : await primero<{ id: number; nombre: string; activo: boolean }>(
        pool,
        'SELECT cat_id AS id, cat_nombre AS nombre, cat_activo AS activo FROM Categorias WHERE cat_id = ?',
        [datos.categoriaId],
      );
  if (!categoria) throw new ReglaNegocioError('Seleccione una categoría.');
  if (!categoria.activo && categoria.id !== actual?.categoriaId) {
    throw new ReglaNegocioError(`La categoría "${categoria.nombre}" está dada de baja.`);
  }

  // Dejar de cargar por ticket GLPI: el proyecto no puede quedar con tareas activas.
  if (actual?.usaGlpi && !datos.usaGlpi) {
    const fila = await primero<{ activas: number }>(
      pool,
      'SELECT COUNT(*) AS activas FROM Tareas WHERE tar_pro = ? AND tar_activo = 1',
      [id],
    );
    const activas = fila?.activas ?? 0;
    if (activas > 0) {
      throw new ReglaNegocioError(
        `No se puede desmarcar "Se carga por ticket GLPI": el proyecto tiene ${activas} tarea(s) activa(s). ` +
          'Primero hay que dar de baja sus tareas.',
      );
    }
  }

  try {
    if (!actual) {
      const resultado = await ejecutar(
        pool,
        'INSERT INTO Proyectos (pro_nombre, pro_cat, pro_usa_glpi) VALUES (?, ?, ?)',
        [nombre, categoria.id, datos.usaGlpi],
      );
      return resultado.insertId;
    }
    await ejecutar(
      pool,
      'UPDATE Proyectos SET pro_nombre = ?, pro_cat = ?, pro_usa_glpi = ? WHERE pro_id = ?',
      [nombre, categoria.id, datos.usaGlpi, id],
    );
    return id;
  } catch (error) {
    if (esDuplicado(error)) throw new ReglaNegocioError(duplicado);   // carrera contra UQ_Proyectos_nombre
    throw error;
  }
}

/** Baja lógica (activo = false) o reactivación. Las horas cargadas no se modifican. */
export async function cambiarEstado(id: number, activo: boolean): Promise<void> {
  const resultado = await ejecutar(pool, 'UPDATE Proyectos SET pro_activo = ? WHERE pro_id = ?', [activo, id]);
  if (resultado.affectedRows === 0) throw new ReglaNegocioError('El proyecto no existe.');
}
