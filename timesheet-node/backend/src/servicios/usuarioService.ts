import { consultar, contiene, ejecutar, esDuplicado, existe, pool, primero } from '../db.js';
import { condicionEstado, type FiltroEstado } from '../dominio/constantes.js';
import { ReglaNegocioError } from '../errores.js';
import { buscarUsuario, type UsuarioDirectorio } from '../seguridad/directorio.js';
import { normalizarLogin } from '../seguridad/seguridadService.js';
import {
  contarAdministradores,
  esFamiliaAdministradora,
  MENSAJE_UNICO_ADMINISTRADOR,
} from './administradores.js';
import { filtrosWhere, texto } from './comun.js';

/**
 * Usuarios. El login debe existir (y estar habilitado) en Active Directory al darlo de alta o cambiarlo.
 * Nadie puede darse de baja a sí mismo ni quitarse el permiso de administrar usuarios, y el sistema nunca queda
 * sin al menos un administrador activo.
 */

const LARGO_MAXIMO_LOGIN = 100;
const LARGO_MAXIMO_NOMBRE = 150;

export interface Usuario {
  id: number;
  login: string;
  nombre: string;
  familiaId: number;
  activo: boolean;
}

export interface UsuarioListado extends Usuario {
  familia: string;
  familiaActiva: boolean;
}

/** Busca la cuenta en AD (acepta "usuario", "DOMINIO\usuario" o "usuario@dominio"). undefined si no existe. */
export async function buscarEnDirectorio(login: unknown): Promise<Omit<UsuarioDirectorio, 'dn'> | undefined> {
  const normalizado = normalizarLogin(login);
  if (!normalizado) return undefined;
  const cuenta = await buscarUsuario(normalizado);
  return cuenta && { login: cuenta.login, nombre: cuenta.nombre, habilitado: cuenta.habilitado };
}

/** Listado del ABM. El texto busca en login y nombre. */
export function listar(
  filtroTexto: string | undefined,
  familiaId: number | undefined,
  estado: FiltroEstado,
): Promise<UsuarioListado[]> {
  const condiciones: string[] = [];
  const parametros: unknown[] = [];
  if (filtroTexto) {
    condiciones.push('(u.usu_login LIKE ? OR u.usu_nombre LIKE ?)');
    parametros.push(contiene(filtroTexto), contiene(filtroTexto));
  }
  if (familiaId !== undefined) {
    condiciones.push('u.usu_fam = ?');
    parametros.push(familiaId);
  }
  const porEstado = condicionEstado('u.usu_activo', estado);
  if (porEstado) condiciones.push(porEstado);

  return consultar<UsuarioListado>(
    pool,
    `SELECT u.usu_id AS id, u.usu_login AS login, u.usu_nombre AS nombre, u.usu_fam AS familiaId,
            u.usu_activo AS activo, f.fam_nombre AS familia, f.fam_activo AS familiaActiva
       FROM Usuarios u JOIN Familias f ON f.fam_id = u.usu_fam
      ${filtrosWhere(condiciones)}
      ORDER BY u.usu_nombre`,
    parametros,
  );
}

export function obtener(id: number): Promise<Usuario | undefined> {
  return primero<Usuario>(
    pool,
    `SELECT usu_id AS id, usu_login AS login, usu_nombre AS nombre, usu_fam AS familiaId, usu_activo AS activo
       FROM Usuarios WHERE usu_id = ?`,
    [id],
  );
}

export interface DatosUsuario {
  login: unknown;
  nombre: unknown;
  familiaId: number | undefined;
}

/**
 * Crea (id = 0) o modifica un usuario y devuelve su id. usuarioActualId es el usuario logueado (para las
 * protecciones sobre uno mismo). No cambia el estado activo (ver cambiarEstado).
 */
export async function guardar(id: number, datos: DatosUsuario, usuarioActualId: number): Promise<number> {
  let login = normalizarLogin(datos.login);
  const nombre = texto(datos.nombre);
  if (!login) throw new ReglaNegocioError('El usuario de red es obligatorio.');
  if (login.length > LARGO_MAXIMO_LOGIN) {
    throw new ReglaNegocioError(`El usuario de red no puede superar los ${LARGO_MAXIMO_LOGIN} caracteres.`);
  }
  if (!nombre) throw new ReglaNegocioError('El nombre es obligatorio.');
  if (nombre.length > LARGO_MAXIMO_NOMBRE) {
    throw new ReglaNegocioError(`El nombre no puede superar los ${LARGO_MAXIMO_NOMBRE} caracteres.`);
  }

  let usuario: Usuario | undefined;
  if (id !== 0) {
    usuario = await obtener(id);
    if (!usuario) throw new ReglaNegocioError('El usuario no existe.');
  }
  const esPropio = usuario !== undefined && id === usuarioActualId;
  const loginCambio = !usuario || login.toLowerCase() !== usuario.login.toLowerCase();

  // La sesión se identifica por el login: cambiarse el propio lo desloguearía.
  if (esPropio && loginCambio) {
    throw new ReglaNegocioError('No puede cambiar su propio usuario de red: perdería la sesión.');
  }

  // Familia: debe estar activa, salvo que sea la que el usuario ya tenía.
  const familia = datos.familiaId === undefined
    ? undefined
    : await primero<{ id: number; nombre: string; activo: boolean }>(
        pool,
        'SELECT fam_id AS id, fam_nombre AS nombre, fam_activo AS activo FROM Familias WHERE fam_id = ?',
        [datos.familiaId],
      );
  if (!familia) throw new ReglaNegocioError('Seleccione una familia.');
  if (!familia.activo && usuario?.familiaId !== familia.id) {
    throw new ReglaNegocioError(`La familia "${familia.nombre}" está dada de baja.`);
  }

  // Login único y, si es nuevo o cambió, existente y habilitado en AD.
  const duplicado = () => `Ya existe un usuario con el usuario de red "${login}".`;
  if (await existe(pool, 'SELECT 1 FROM Usuarios WHERE usu_login = ? AND usu_id <> ?', [login, id])) {
    throw new ReglaNegocioError(duplicado());
  }
  if (loginCambio) {
    const cuenta = await buscarUsuario(login);
    if (!cuenta) throw new ReglaNegocioError(`El usuario de red "${login}" no existe en Active Directory.`);
    if (!cuenta.habilitado) {
      throw new ReglaNegocioError(`La cuenta "${cuenta.login}" está deshabilitada en Active Directory.`);
    }
    login = cuenta.login;   // se guarda tal como figura en AD
  } else {
    login = usuario!.login; // mismo login con otras mayúsculas: se conserva el guardado
  }

  // Protección contra quedarse afuera al cambiar de familia.
  if (usuario && usuario.familiaId !== familia.id) {
    const nuevaEsAdministradora = await esFamiliaAdministradora(pool, familia.id);
    if (esPropio && !nuevaEsAdministradora) {
      throw new ReglaNegocioError(
        'No puede cambiarse a una familia sin permiso de administrar usuarios: perdería el acceso a esta pantalla.',
      );
    }
    if (usuario.activo && !nuevaEsAdministradora &&
        await esFamiliaAdministradora(pool, usuario.familiaId) &&
        (await contarAdministradores(pool, id)) === 0) {
      throw new ReglaNegocioError(MENSAJE_UNICO_ADMINISTRADOR);
    }
  }

  try {
    if (!usuario) {
      const resultado = await ejecutar(
        pool,
        'INSERT INTO Usuarios (usu_login, usu_nombre, usu_fam) VALUES (?, ?, ?)',
        [login, nombre, familia.id],
      );
      return resultado.insertId;
    }
    await ejecutar(
      pool,
      'UPDATE Usuarios SET usu_login = ?, usu_nombre = ?, usu_fam = ? WHERE usu_id = ?',
      [login, nombre, familia.id, id],
    );
    return id;
  } catch (error) {
    if (esDuplicado(error)) throw new ReglaNegocioError(duplicado());   // carrera contra UQ_Usuarios_login
    throw error;
  }
}

/**
 * Baja lógica (activo = false) o reactivación. Las horas cargadas no se modifican.
 * Un usuario dado de baja pierde el acceso en el siguiente request.
 */
export async function cambiarEstado(id: number, activo: boolean, usuarioActualId: number): Promise<void> {
  const usuario = await obtener(id);
  if (!usuario) throw new ReglaNegocioError('El usuario no existe.');

  if (!activo) {
    if (id === usuarioActualId) throw new ReglaNegocioError('No puede darse de baja a sí mismo.');
    if (usuario.activo && await esFamiliaAdministradora(pool, usuario.familiaId) &&
        (await contarAdministradores(pool, id)) === 0) {
      throw new ReglaNegocioError(MENSAJE_UNICO_ADMINISTRADOR);
    }
  }
  await ejecutar(pool, 'UPDATE Usuarios SET usu_activo = ? WHERE usu_id = ?', [activo, id]);
}
