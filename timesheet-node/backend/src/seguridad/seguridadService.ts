import { consultar, pool, primero } from '../db.js';
import { Patente } from '../dominio/constantes.js';
import { DirectorioNoDisponibleError, validarCredenciales } from './directorio.js';

/** Usuario logueado con sus permisos (patentes activas de su familia), resueltos desde la base en cada request. */
export interface Sesion {
  usuarioId: number;
  login: string;
  nombre: string;
  familiaId: number;
  familia: string;
  patentes: string[];
}

export type ResultadoLogin = { exitoso: true; sesion: Sesion } | { exitoso: false; mensaje: string };

/** Acepta "usuario", "DOMINIO\usuario" o "usuario@dominio" y devuelve solo "usuario". */
export function normalizarLogin(login: unknown): string {
  if (typeof login !== 'string') return '';
  let resultado = login.trim();
  const barra = resultado.lastIndexOf('\\');
  if (barra >= 0) resultado = resultado.slice(barra + 1);
  const arroba = resultado.indexOf('@');
  if (arroba >= 0) resultado = resultado.slice(0, arroba);
  return resultado;
}

/** AD valida identidad; Usuario → Familia → Patentes define qué puede hacer. */
export async function iniciarSesion(loginIngresado: unknown, password: unknown): Promise<ResultadoLogin> {
  const login = normalizarLogin(loginIngresado);
  const clave = typeof password === 'string' ? password : '';
  if (!login || !clave) return { exitoso: false, mensaje: 'Ingrese usuario y contraseña.' };

  try {
    if (!(await validarCredenciales(login, clave))) {
      return { exitoso: false, mensaje: 'Usuario o contraseña incorrectos.' };
    }
  } catch (error) {
    if (error instanceof DirectorioNoDisponibleError) {
      return {
        exitoso: false,
        mensaje: 'No se pudo contactar al servidor de dominio. Intente nuevamente en unos minutos.',
      };
    }
    throw error;
  }

  const sesion = await obtenerSesion(login);
  if (!sesion) {
    return {
      exitoso: false,
      mensaje: 'Su usuario no está habilitado en el sistema de carga de horas. Contacte al administrador.',
    };
  }
  return { exitoso: true, sesion };
}

/**
 * Arma la sesión de un usuario ya autenticado. undefined si el usuario no existe, está dado de baja,
 * su familia está dada de baja o no tiene la patente CARGA_HORAS (mínimo para ingresar).
 */
export async function obtenerSesion(login: string): Promise<Sesion | undefined> {
  if (!login.trim()) return undefined;

  const usuario = await primero<Omit<Sesion, 'patentes'>>(
    pool,
    `SELECT u.usu_id AS usuarioId, u.usu_login AS login, u.usu_nombre AS nombre,
            f.fam_id AS familiaId, f.fam_nombre AS familia
       FROM Usuarios u
       JOIN Familias f ON f.fam_id = u.usu_fam
      WHERE u.usu_login = ? AND u.usu_activo = 1 AND f.fam_activo = 1`,
    [login],
  );
  if (!usuario) return undefined;

  const patentes = await consultar<{ nombre: string }>(
    pool,
    `SELECT p.pat_nombre AS nombre
       FROM Familia_Patente fp
       JOIN Patentes p ON p.pat_id = fp.pat_id
      WHERE fp.fam_id = ? AND p.pat_activo = 1
      ORDER BY p.pat_nombre`,
    [usuario.familiaId],
  );

  const sesion: Sesion = { ...usuario, patentes: patentes.map((p) => p.nombre) };
  return sesion.patentes.includes(Patente.CARGA_HORAS) ? sesion : undefined;
}
