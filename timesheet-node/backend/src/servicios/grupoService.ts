import { consultar, contiene, ejecutar, enTransaccion, esDuplicado, existe, pool, primero } from '../db.js';
import { condicionEstado, type FiltroEstado } from '../dominio/constantes.js';
import { ReglaNegocioError } from '../errores.js';
import { filtrosWhere, texto } from './comun.js';

/**
 * Grupos de usuarios. Reúnen personas (un usuario puede estar en varios grupos) y sirven para filtrar los reportes.
 * No otorgan permisos: eso lo hacen las Familias. La baja es lógica y los reportes siguen mostrando las horas.
 */

const LARGO_MAXIMO_NOMBRE = 100;

export interface Grupo {
  id: number;
  nombre: string;
  activo: boolean;
}

export interface GrupoConUsuarios extends Grupo {
  usuarioIds: number[];
}

export interface GrupoListado extends Grupo {
  usuariosActivos: number;
}

export interface UsuarioDeGrupo {
  id: number;
  login: string;
  nombre: string;
  activo: boolean;
}

/** Listado del ABM con filtros opcionales por texto (nombre) y estado. */
export function listar(filtroTexto: string | undefined, estado: FiltroEstado): Promise<GrupoListado[]> {
  const condiciones: string[] = [];
  const parametros: unknown[] = [];
  if (filtroTexto) {
    condiciones.push('g.gru_nombre LIKE ?');
    parametros.push(contiene(filtroTexto));
  }
  const porEstado = condicionEstado('g.gru_activo', estado);
  if (porEstado) condiciones.push(porEstado);

  return consultar<GrupoListado>(
    pool,
    `SELECT g.gru_id AS id, g.gru_nombre AS nombre, g.gru_activo AS activo,
            (SELECT COUNT(*) FROM Grupo_Usuario gu JOIN Usuarios u ON u.usu_id = gu.usu_id
              WHERE gu.gru_id = g.gru_id AND u.usu_activo = 1) AS usuariosActivos
       FROM Grupos g
      ${filtrosWhere(condiciones)}
      ORDER BY g.gru_nombre`,
    parametros,
  );
}

/** Usuarios para el formulario: los activos, más los que ya integran el grupo indicado aunque estén dados de baja. */
export function usuariosDisponibles(incluirGrupoId?: number): Promise<UsuarioDeGrupo[]> {
  return consultar<UsuarioDeGrupo>(
    pool,
    `SELECT u.usu_id AS id, u.usu_login AS login, u.usu_nombre AS nombre, u.usu_activo AS activo
       FROM Usuarios u
      WHERE u.usu_activo = 1
         OR u.usu_id IN (SELECT gu.usu_id FROM Grupo_Usuario gu WHERE gu.gru_id = ?)
      ORDER BY u.usu_nombre`,
    [incluirGrupoId ?? 0],
  );
}

/** El grupo con los ids de sus usuarios, o undefined si no existe. */
export async function obtener(id: number): Promise<GrupoConUsuarios | undefined> {
  const grupo = await primero<Grupo>(
    pool,
    'SELECT gru_id AS id, gru_nombre AS nombre, gru_activo AS activo FROM Grupos WHERE gru_id = ?',
    [id],
  );
  if (!grupo) return undefined;
  const usuarios = await consultar<{ id: number }>(pool, 'SELECT usu_id AS id FROM Grupo_Usuario WHERE gru_id = ?', [id]);
  return { ...grupo, usuarioIds: usuarios.map((u) => u.id) };
}

/** Crea (id = 0) o modifica un grupo con sus usuarios y devuelve su id. No cambia el estado activo. */
export async function guardar(id: number, nombreIngresado: unknown, usuarioIds: number[]): Promise<number> {
  const nombre = texto(nombreIngresado);
  if (!nombre) throw new ReglaNegocioError('El nombre del grupo es obligatorio.');
  if (nombre.length > LARGO_MAXIMO_NOMBRE) {
    throw new ReglaNegocioError(`El nombre del grupo no puede superar los ${LARGO_MAXIMO_NOMBRE} caracteres.`);
  }
  const ids = [...new Set(usuarioIds)];
  const duplicado = `Ya existe un grupo con el nombre "${nombre}".`;

  if (await existe(pool, 'SELECT 1 FROM Grupos WHERE gru_nombre = ? AND gru_id <> ?', [nombre, id])) {
    throw new ReglaNegocioError(duplicado);
  }
  if (id !== 0 && !(await existe(pool, 'SELECT 1 FROM Grupos WHERE gru_id = ?', [id]))) {
    throw new ReglaNegocioError('El grupo no existe.');
  }
  if (ids.length > 0) {
    const encontrados = await consultar<{ id: number }>(pool, 'SELECT usu_id AS id FROM Usuarios WHERE usu_id IN (?)', [ids]);
    if (encontrados.length !== ids.length) throw new ReglaNegocioError('Alguno de los usuarios seleccionados no existe.');
  }

  try {
    return await enTransaccion(async (cx) => {
      let grupoId = id;
      if (id === 0) {
        grupoId = (await ejecutar(cx, 'INSERT INTO Grupos (gru_nombre) VALUES (?)', [nombre])).insertId;
      } else {
        await ejecutar(cx, 'UPDATE Grupos SET gru_nombre = ? WHERE gru_id = ?', [nombre, id]);
        await ejecutar(cx, 'DELETE FROM Grupo_Usuario WHERE gru_id = ?', [id]);
      }
      if (ids.length > 0) {
        await ejecutar(cx, 'INSERT INTO Grupo_Usuario (gru_id, usu_id) VALUES ?', [ids.map((usuarioId) => [grupoId, usuarioId])]);
      }
      return grupoId;
    });
  } catch (error) {
    if (esDuplicado(error)) throw new ReglaNegocioError(duplicado);   // carrera contra UQ_Grupos_nombre
    throw error;
  }
}

/** Baja lógica (activo = false) o reactivación. Los miembros se conservan para poder reactivarlo. */
export async function cambiarEstado(id: number, activo: boolean): Promise<void> {
  if (!(await existe(pool, 'SELECT 1 FROM Grupos WHERE gru_id = ?', [id]))) {
    throw new ReglaNegocioError('El grupo no existe.');
  }
  await ejecutar(pool, 'UPDATE Grupos SET gru_activo = ? WHERE gru_id = ?', [activo, id]);
}
