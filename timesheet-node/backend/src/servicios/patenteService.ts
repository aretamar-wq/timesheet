import { consultar, contiene, ejecutar, pool, primero } from '../db.js';
import { ReglaNegocioError } from '../errores.js';
import { filtrosWhere, texto } from './comun.js';

/**
 * Patentes (permisos). Se crean por script junto con el código que las usa (constantes.ts), así que desde la
 * aplicación no se dan de alta, no se renombran ni se dan de baja: solo se consulta y se cambia la descripción.
 * Para quitar un permiso se quita la patente de la familia.
 */

const LARGO_MAXIMO_DESCRIPCION = 250;

export interface Patente {
  id: number;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

export interface PatenteListado extends Patente {
  familiasActivas: number;
}

/** Todas las patentes (activas y dadas de baja), para los checkboxes del ABM de Familias. */
export function opciones(): Promise<Patente[]> {
  return consultar<Patente>(
    pool,
    `SELECT pat_id AS id, pat_nombre AS nombre, pat_descripcion AS descripcion, pat_activo AS activo
       FROM Patentes ORDER BY pat_nombre`,
  );
}

/** Listado con filtro opcional por texto (nombre o descripción). */
export function listar(filtroTexto: string | undefined): Promise<PatenteListado[]> {
  const condiciones: string[] = [];
  const parametros: unknown[] = [];
  if (filtroTexto) {
    condiciones.push('(p.pat_nombre LIKE ? OR p.pat_descripcion LIKE ?)');
    parametros.push(contiene(filtroTexto), contiene(filtroTexto));
  }
  return consultar<PatenteListado>(
    pool,
    `SELECT p.pat_id AS id, p.pat_nombre AS nombre, p.pat_descripcion AS descripcion, p.pat_activo AS activo,
            (SELECT COUNT(*) FROM Familia_Patente fp JOIN Familias f ON f.fam_id = fp.fam_id
              WHERE fp.pat_id = p.pat_id AND f.fam_activo = 1) AS familiasActivas
       FROM Patentes p
      ${filtrosWhere(condiciones)}
      ORDER BY p.pat_nombre`,
    parametros,
  );
}

export function obtener(id: number): Promise<Patente | undefined> {
  return primero<Patente>(
    pool,
    `SELECT pat_id AS id, pat_nombre AS nombre, pat_descripcion AS descripcion, pat_activo AS activo
       FROM Patentes WHERE pat_id = ?`,
    [id],
  );
}

/** Cambia la descripción de una patente (lo único editable). */
export async function modificarDescripcion(id: number, descripcion: unknown): Promise<void> {
  const valor = texto(descripcion);
  if (valor.length > LARGO_MAXIMO_DESCRIPCION) {
    throw new ReglaNegocioError(`La descripción no puede superar los ${LARGO_MAXIMO_DESCRIPCION} caracteres.`);
  }
  const resultado = await ejecutar(pool, 'UPDATE Patentes SET pat_descripcion = ? WHERE pat_id = ?', [
    valor || null,
    id,
  ]);
  if (resultado.affectedRows === 0) throw new ReglaNegocioError('La patente no existe.');
}
