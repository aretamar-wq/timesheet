import { consultar, contiene, ejecutar, esDuplicado, pool, primero } from '../db.js';
import { condicionEstado, type FiltroEstado } from '../dominio/constantes.js';
import { aDiaMesAnio, parsearFecha } from '../dominio/fechas.js';
import { ReglaNegocioError } from '../errores.js';
import { filtrosWhere, texto } from './comun.js';

const LARGO_MAXIMO_DESCRIPCION = 100;

export interface Feriado {
  id: number;
  fecha: string;
  descripcion: string;
  activo: boolean;
}

/** Listado del ABM con filtros opcionales por año, texto (descripción) y estado. */
export function listar(anio: number | undefined, filtroTexto: string | undefined, estado: FiltroEstado): Promise<Feriado[]> {
  const condiciones: string[] = [];
  const parametros: unknown[] = [];
  if (anio !== undefined) {
    condiciones.push('fer_fecha BETWEEN ? AND ?');
    parametros.push(`${anio}-01-01`, `${anio}-12-31`);
  }
  if (filtroTexto) {
    condiciones.push('fer_descripcion LIKE ?');
    parametros.push(contiene(filtroTexto));
  }
  const porEstado = condicionEstado('fer_activo', estado);
  if (porEstado) condiciones.push(porEstado);

  return consultar<Feriado>(
    pool,
    `SELECT fer_id AS id, fer_fecha AS fecha, fer_descripcion AS descripcion, fer_activo AS activo
       FROM Feriados
      ${filtrosWhere(condiciones)}
      ORDER BY fer_fecha`,
    parametros,
  );
}

export function obtener(id: number): Promise<Feriado | undefined> {
  return primero<Feriado>(
    pool,
    `SELECT fer_id AS id, fer_fecha AS fecha, fer_descripcion AS descripcion, fer_activo AS activo
       FROM Feriados WHERE fer_id = ?`,
    [id],
  );
}

/** Feriados activos entre dos fechas (inclusive), para la grilla de carga de horas. */
export function activosEntre(desde: string, hasta: string): Promise<{ fecha: string; descripcion: string }[]> {
  return consultar(
    pool,
    `SELECT fer_fecha AS fecha, fer_descripcion AS descripcion
       FROM Feriados
      WHERE fer_activo = 1 AND fer_fecha BETWEEN ? AND ?`,
    [desde, hasta],
  );
}

/** Crea (id = 0) o modifica un feriado y devuelve su id. No cambia el estado activo (ver cambiarEstado). */
export async function guardar(id: number, fechaIngresada: unknown, descripcionIngresada: unknown): Promise<number> {
  const fecha = parsearFecha(fechaIngresada);
  if (!fecha) throw new ReglaNegocioError('La fecha del feriado es obligatoria.');
  const descripcion = texto(descripcionIngresada);
  if (!descripcion) throw new ReglaNegocioError('La descripción del feriado es obligatoria.');
  if (descripcion.length > LARGO_MAXIMO_DESCRIPCION) {
    throw new ReglaNegocioError(`La descripción no puede superar los ${LARGO_MAXIMO_DESCRIPCION} caracteres.`);
  }

  const otro = await primero<{ activo: boolean }>(
    pool,
    'SELECT fer_activo AS activo FROM Feriados WHERE fer_fecha = ? AND fer_id <> ?',
    [fecha, id],
  );
  const duplicado = (dadoDeBaja: boolean) =>
    `Ya existe un feriado el ${aDiaMesAnio(fecha)}${dadoDeBaja ? ' (dado de baja; se puede reactivar)' : ''}.`;
  if (otro) throw new ReglaNegocioError(duplicado(!otro.activo));

  try {
    if (id === 0) {
      const resultado = await ejecutar(pool, 'INSERT INTO Feriados (fer_fecha, fer_descripcion) VALUES (?, ?)', [
        fecha,
        descripcion,
      ]);
      return resultado.insertId;
    }
    if (!(await obtener(id))) throw new ReglaNegocioError('El feriado no existe.');
    await ejecutar(pool, 'UPDATE Feriados SET fer_fecha = ?, fer_descripcion = ? WHERE fer_id = ?', [
      fecha,
      descripcion,
      id,
    ]);
    return id;
  } catch (error) {
    if (esDuplicado(error)) throw new ReglaNegocioError(duplicado(false));   // carrera contra UQ_Feriados_fecha
    throw error;
  }
}

/** Baja lógica (activo = false) o reactivación. Dado de baja, el día deja de mostrarse como feriado en la grilla. */
export async function cambiarEstado(id: number, activo: boolean): Promise<void> {
  const resultado = await ejecutar(pool, 'UPDATE Feriados SET fer_activo = ? WHERE fer_id = ?', [activo, id]);
  if (resultado.affectedRows === 0) throw new ReglaNegocioError('El feriado no existe.');
}
