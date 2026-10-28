import { ejecutar, esDuplicado, consultar, pool, primero, type Ejecutor } from '../db.js';
import { diasEntre, lunesDe, sumarDias } from '../dominio/fechas.js';
import { ReglaNegocioError } from '../errores.js';

/** Reglas de negocio de la carga de horas (tabla Tiempo). */

export const DURACION_MAXIMA = 24;
/** Las horas se cargan en módulos de 30 minutos (0.5 h). */
export const MODULO_HORAS = 0.5;

/** Fila de la grilla: Proyecto + Tarea (opcional) con las horas de cada día (índice 0 = lunes). */
export interface FilaCarga {
  proyectoId: number;
  proyecto: string;
  categoriaId: number;
  tareaId: number | null;
  tarea: string | null;
  glpi: number | null;
  /** false si la fila no se puede modificar (ver motivoNoEditable): las horas se muestran igual. */
  editable: boolean;
  motivoNoEditable: string | null;
  horas: (number | null)[];
}

export interface SemanaCarga {
  lunes: string;
  filas: FilaCarga[];
}

interface TiempoConDatos {
  fecha: string;
  duracion: number;
  proyectoId: number;
  proyecto: string;
  categoriaId: number;
  proyectoActivo: boolean;
  usaGlpi: boolean;
  tareaId: number | null;
  tarea: string | null;
  glpi: number | null;
  tareaActiva: boolean | null;
}

/** Grilla de la semana que contiene a la fecha: una fila por cada Proyecto + Tarea con horas cargadas. */
export async function obtenerSemana(usuarioId: number, fecha: string): Promise<SemanaCarga> {
  const lunes = lunesDe(fecha);
  const tiempos = await tiemposDeLaSemana(usuarioId, lunes);

  const filas = agruparEnFilas(tiempos);
  for (const t of tiempos) {
    filas.get(claveFila(t))!.horas[diasEntre(lunes, t.fecha)] = t.duracion;
  }
  return { lunes, filas: ordenar([...filas.values()]) };
}

/**
 * Filas (sin horas) de la semana anterior a la que contiene a la fecha, para "Copiar semana anterior".
 * Solo incluye filas que hoy se pueden cargar (proyecto/tarea activos y acordes a la configuración del proyecto).
 */
export async function filasSemanaAnterior(usuarioId: number, fecha: string): Promise<FilaCarga[]> {
  const tiempos = await tiemposDeLaSemana(usuarioId, sumarDias(lunesDe(fecha), -7));
  return ordenar([...agruparEnFilas(tiempos).values()].filter((f) => f.editable));
}

/** Guarda una celda de la grilla: duración 0 borra la carga; si no, la crea o la actualiza. */
export async function guardarCelda(
  usuarioId: number,
  fecha: string,
  proyectoId: number,
  tareaId: number | null,
  duracion: number,
): Promise<void> {
  const existente = await primero<{ id: number }>(
    pool,
    `SELECT tie_id AS id FROM Tiempo
      WHERE tie_usu = ? AND tie_pro = ? AND tie_tar_clave = ? AND tie_fecha = ?`,
    [usuarioId, proyectoId, tareaId ?? 0, fecha],
  );

  try {
    if (duracion === 0) {
      if (!existente) return;
      // Regla 5: las horas de proyectos/tareas dados de baja no se modifican (tampoco se borran).
      await validarProyectoYTarea(pool, proyectoId, tareaId);
      await ejecutar(pool, 'DELETE FROM Tiempo WHERE tie_id = ?', [existente.id]);
      return;
    }

    // Regla 2: 0 < duración <= 24, en módulos de 30 minutos.
    if (duracion <= 0 || duracion > DURACION_MAXIMA) {
      throw new ReglaNegocioError('La duración debe ser mayor a 0:00 y menor o igual a 24:00.');
    }
    if (duracion % MODULO_HORAS !== 0) {
      throw new ReglaNegocioError('La duración se carga en módulos de 30 minutos (por ejemplo 1:00, 1:30, 2:00).');
    }
    await validarProyectoYTarea(pool, proyectoId, tareaId);
    await validarTareaSegunProyecto(pool, proyectoId, tareaId);

    if (existente) {
      await ejecutar(pool, 'UPDATE Tiempo SET tie_duracion = ? WHERE tie_id = ?', [duracion, existente.id]);
    } else {
      // Regla 6: una sola carga por (usuario, proyecto, tarea, fecha); la garantiza UQ_Tiempo_celda.
      await ejecutar(
        pool,
        'INSERT INTO Tiempo (tie_fecha, tie_usu, tie_pro, tie_tar, tie_duracion) VALUES (?, ?, ?, ?, ?)',
        [fecha, usuarioId, proyectoId, tareaId, duracion],
      );
    }
  } catch (error) {
    // Carrera contra UQ_Tiempo_celda (la misma celda guardada a la vez desde otra ventana).
    if (esDuplicado(error)) {
      throw new ReglaNegocioError('No se pudo guardar porque la celda cambió desde otra ventana. Recargue la página.');
    }
    throw error;
  }
}

/** Reglas 4 y 5: proyecto y tarea activos, y la tarea pertenece al proyecto. */
async function validarProyectoYTarea(ej: Ejecutor, proyectoId: number, tareaId: number | null): Promise<void> {
  const proyecto = await primero<{ activo: boolean }>(ej, 'SELECT pro_activo AS activo FROM Proyectos WHERE pro_id = ?', [
    proyectoId,
  ]);
  if (!proyecto?.activo) throw new ReglaNegocioError('El proyecto no existe o está dado de baja.');

  if (tareaId !== null) {
    const tarea = await primero<{ activo: boolean; proyectoId: number }>(
      ej,
      'SELECT tar_activo AS activo, tar_pro AS proyectoId FROM Tareas WHERE tar_id = ?',
      [tareaId],
    );
    if (!tarea?.activo) throw new ReglaNegocioError('La tarea no existe o está dada de baja.');
    if (tarea.proyectoId !== proyectoId) throw new ReglaNegocioError('La tarea seleccionada no pertenece al proyecto.');
  }
}

/**
 * Regla 7: si el proyecto se carga por ticket GLPI, las horas van siempre contra una tarea;
 * si no, el proyecto no admite tareas. (Solo al guardar; borrar horas existentes no lo exige.)
 */
async function validarTareaSegunProyecto(ej: Ejecutor, proyectoId: number, tareaId: number | null): Promise<void> {
  const proyecto = await primero<{ usaGlpi: boolean }>(ej, 'SELECT pro_usa_glpi AS usaGlpi FROM Proyectos WHERE pro_id = ?', [
    proyectoId,
  ]);
  if (proyecto?.usaGlpi && tareaId === null) {
    throw new ReglaNegocioError('Este proyecto se carga por ticket GLPI: elija la tarea (ticket) correspondiente.');
  }
  if (!proyecto?.usaGlpi && tareaId !== null) {
    throw new ReglaNegocioError('Este proyecto no se carga por ticket GLPI: las horas se cargan sin tarea.');
  }
}

/**
 * Por qué una fila no se puede modificar, o null si se puede: proyecto/tarea dados de baja, o la fila ya no
 * coincide con la configuración del proyecto (se cambió "Se carga por ticket GLPI" después de cargarla).
 */
function motivoNoEditable(t: TiempoConDatos): string | null {
  if (!t.proyectoActivo || (t.tareaId !== null && !t.tareaActiva)) return 'Dado de baja';
  if (t.usaGlpi !== (t.tareaId !== null)) return 'Solo lectura: cambió la configuración del proyecto';
  return null;
}

function claveFila(t: { proyectoId: number; tareaId: number | null }): string {
  return `${t.proyectoId}-${t.tareaId ?? 0}`;
}

function agruparEnFilas(tiempos: TiempoConDatos[]): Map<string, FilaCarga> {
  const filas = new Map<string, FilaCarga>();
  for (const t of tiempos) {
    const clave = claveFila(t);
    if (filas.has(clave)) continue;
    const motivo = motivoNoEditable(t);
    filas.set(clave, {
      proyectoId: t.proyectoId,
      proyecto: t.proyecto,
      categoriaId: t.categoriaId,
      tareaId: t.tareaId,
      tarea: t.tarea,
      glpi: t.glpi,
      editable: motivo === null,
      motivoNoEditable: motivo,
      horas: Array<number | null>(7).fill(null),
    });
  }
  return filas;
}

function ordenar(filas: FilaCarga[]): FilaCarga[] {
  const comparar = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '', 'es');
  return filas.sort((a, b) => comparar(a.proyecto, b.proyecto) || comparar(a.tarea, b.tarea));
}

function tiemposDeLaSemana(usuarioId: number, lunes: string): Promise<TiempoConDatos[]> {
  return consultar<TiempoConDatos>(
    pool,
    `SELECT t.tie_fecha AS fecha, t.tie_duracion AS duracion,
            p.pro_id AS proyectoId, p.pro_nombre AS proyecto, p.pro_cat AS categoriaId,
            p.pro_activo AS proyectoActivo, p.pro_usa_glpi AS usaGlpi,
            ta.tar_id AS tareaId, ta.tar_nombre AS tarea, ta.tar_glpi AS glpi, ta.tar_activo AS tareaActiva
       FROM Tiempo t
       JOIN Proyectos p ON p.pro_id = t.tie_pro
       LEFT JOIN Tareas ta ON ta.tar_id = t.tie_tar
      WHERE t.tie_usu = ? AND t.tie_fecha BETWEEN ? AND ?`,
    [usuarioId, lunes, sumarDias(lunes, 6)],
  );
}
