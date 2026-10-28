import { consultar, contiene, ejecutar, esDuplicado, existe, pool, primero } from '../db.js';
import { condicionEstado, Patente, type FiltroEstado } from '../dominio/constantes.js';
import { ReglaNegocioError } from '../errores.js';
import { familiaDeUsuario, guardarSinPerderAdministradores } from './administradores.js';
import { filtrosWhere, texto } from './comun.js';

/**
 * Familias (seguridad). Ningún cambio puede dejar al sistema sin administradores activos, y el usuario logueado
 * no puede dar de baja su propia familia ni quitarle CARGA_HORAS o ABM_USUARIOS.
 */

const LARGO_MAXIMO_NOMBRE = 100;

export interface Familia {
  id: number;
  nombre: string;
  activo: boolean;
}

export interface FamiliaConPatentes extends Familia {
  patenteIds: number[];
}

export interface FamiliaListado extends Familia {
  patentesActivas: number;
  usuariosActivos: number;
}

/** Familias para un desplegable: las activas, más la indicada aunque esté dada de baja. */
export function opciones(incluirId?: number): Promise<Familia[]> {
  return consultar<Familia>(
    pool,
    `SELECT fam_id AS id, fam_nombre AS nombre, fam_activo AS activo
       FROM Familias
      WHERE fam_activo = 1 OR fam_id = ?
      ORDER BY fam_nombre`,
    [incluirId ?? 0],
  );
}

/** Listado del ABM con filtros opcionales por texto (nombre) y estado. */
export function listar(filtroTexto: string | undefined, estado: FiltroEstado): Promise<FamiliaListado[]> {
  const condiciones: string[] = [];
  const parametros: unknown[] = [];
  if (filtroTexto) {
    condiciones.push('f.fam_nombre LIKE ?');
    parametros.push(contiene(filtroTexto));
  }
  const porEstado = condicionEstado('f.fam_activo', estado);
  if (porEstado) condiciones.push(porEstado);

  return consultar<FamiliaListado>(
    pool,
    `SELECT f.fam_id AS id, f.fam_nombre AS nombre, f.fam_activo AS activo,
            (SELECT COUNT(*) FROM Familia_Patente fp JOIN Patentes p ON p.pat_id = fp.pat_id
              WHERE fp.fam_id = f.fam_id AND p.pat_activo = 1) AS patentesActivas,
            (SELECT COUNT(*) FROM Usuarios u WHERE u.usu_fam = f.fam_id AND u.usu_activo = 1) AS usuariosActivos
       FROM Familias f
      ${filtrosWhere(condiciones)}
      ORDER BY f.fam_nombre`,
    parametros,
  );
}

/** La familia con los ids de sus patentes, o undefined si no existe. */
export async function obtener(id: number): Promise<FamiliaConPatentes | undefined> {
  const familia = await primero<Familia>(
    pool,
    'SELECT fam_id AS id, fam_nombre AS nombre, fam_activo AS activo FROM Familias WHERE fam_id = ?',
    [id],
  );
  if (!familia) return undefined;
  const patentes = await consultar<{ id: number }>(pool, 'SELECT pat_id AS id FROM Familia_Patente WHERE fam_id = ?', [
    id,
  ]);
  return { ...familia, patenteIds: patentes.map((p) => p.id) };
}

/** Crea (id = 0) o modifica una familia con sus patentes y devuelve su id. No cambia el estado activo. */
export async function guardar(
  id: number,
  nombreIngresado: unknown,
  patenteIds: number[],
  usuarioActualId: number,
): Promise<number> {
  const nombre = texto(nombreIngresado);
  if (!nombre) throw new ReglaNegocioError('El nombre de la familia es obligatorio.');
  if (nombre.length > LARGO_MAXIMO_NOMBRE) {
    throw new ReglaNegocioError(`El nombre de la familia no puede superar los ${LARGO_MAXIMO_NOMBRE} caracteres.`);
  }
  const ids = [...new Set(patenteIds)];
  if (ids.length === 0) throw new ReglaNegocioError('Seleccione al menos una patente.');
  const duplicado = `Ya existe una familia con el nombre "${nombre}".`;

  if (await existe(pool, 'SELECT 1 FROM Familias WHERE fam_nombre = ? AND fam_id <> ?', [nombre, id])) {
    throw new ReglaNegocioError(duplicado);
  }
  if (id !== 0 && !(await existe(pool, 'SELECT 1 FROM Familias WHERE fam_id = ?', [id]))) {
    throw new ReglaNegocioError('La familia no existe.');
  }

  const patentes = await consultar<{ id: number; nombre: string; activo: boolean }>(
    pool,
    'SELECT pat_id AS id, pat_nombre AS nombre, pat_activo AS activo FROM Patentes WHERE pat_id IN (?)',
    [ids],
  );
  if (patentes.length !== ids.length) throw new ReglaNegocioError('Alguna de las patentes seleccionadas no existe.');

  // La familia del usuario logueado tiene que seguir permitiéndole ingresar y administrar usuarios.
  if (id !== 0 && (await familiaDeUsuario(pool, usuarioActualId)) === id) {
    const activas = patentes.filter((p) => p.activo).map((p) => p.nombre);
    if (!activas.includes(Patente.CARGA_HORAS) || !activas.includes(Patente.ABM_USUARIOS)) {
      throw new ReglaNegocioError(
        'No puede quitarle CARGA_HORAS ni ABM_USUARIOS a su propia familia: perdería el acceso.',
      );
    }
  }

  try {
    return await guardarSinPerderAdministradores(async (cx) => {
      let familiaId = id;
      if (id === 0) {
        familiaId = (await ejecutar(cx, 'INSERT INTO Familias (fam_nombre) VALUES (?)', [nombre])).insertId;
      } else {
        await ejecutar(cx, 'UPDATE Familias SET fam_nombre = ? WHERE fam_id = ?', [nombre, id]);
        await ejecutar(cx, 'DELETE FROM Familia_Patente WHERE fam_id = ?', [id]);
      }
      await ejecutar(cx, 'INSERT INTO Familia_Patente (fam_id, pat_id) VALUES ?', [
        ids.map((patenteId) => [familiaId, patenteId]),
      ]);
      return familiaId;
    });
  } catch (error) {
    if (esDuplicado(error)) throw new ReglaNegocioError(duplicado);   // carrera contra UQ_Familias_nombre
    throw error;
  }
}

/**
 * Baja lógica (activo = false) o reactivación. Los usuarios de una familia dada de baja pierden el acceso
 * en el siguiente request.
 */
export async function cambiarEstado(id: number, activo: boolean, usuarioActualId: number): Promise<void> {
  if (!(await existe(pool, 'SELECT 1 FROM Familias WHERE fam_id = ?', [id]))) {
    throw new ReglaNegocioError('La familia no existe.');
  }
  if (!activo && (await familiaDeUsuario(pool, usuarioActualId)) === id) {
    throw new ReglaNegocioError('No puede dar de baja su propia familia: perdería el acceso.');
  }
  await guardarSinPerderAdministradores((cx) =>
    ejecutar(cx, 'UPDATE Familias SET fam_activo = ? WHERE fam_id = ?', [activo, id]),
  );
}
