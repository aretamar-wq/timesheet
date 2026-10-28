import type { PoolConnection } from 'mysql2/promise';
import { consultar, enTransaccion, primero, type Ejecutor } from '../db.js';
import { Patente } from '../dominio/constantes.js';
import { ReglaNegocioError } from '../errores.js';

/**
 * Protección contra quedarse afuera: el sistema nunca queda sin al menos un administrador activo, es decir, un
 * usuario activo cuya familia (activa) tiene activas CARGA_HORAS (para ingresar) y ABM_USUARIOS (para administrar).
 */

export const MENSAJE_UNICO_ADMINISTRADOR =
  'Es el único administrador activo: el sistema quedaría sin nadie que pueda administrar usuarios.';

/** Una familia es "administradora" si está activa y tiene activas CARGA_HORAS y ABM_USUARIOS. */
export async function esFamiliaAdministradora(ej: Ejecutor, familiaId: number): Promise<boolean> {
  const patentes = await consultar<{ nombre: string }>(
    ej,
    `SELECT p.pat_nombre AS nombre
       FROM Familias f
       JOIN Familia_Patente fp ON fp.fam_id = f.fam_id
       JOIN Patentes p ON p.pat_id = fp.pat_id
      WHERE f.fam_id = ? AND f.fam_activo = 1 AND p.pat_activo = 1`,
    [familiaId],
  );
  const nombres = patentes.map((p) => p.nombre);
  return nombres.includes(Patente.CARGA_HORAS) && nombres.includes(Patente.ABM_USUARIOS);
}

/** Usuarios activos cuya familia es administradora, sin contar al indicado. */
export async function contarAdministradores(ej: Ejecutor, excluirUsuarioId: number): Promise<number> {
  const fila = await primero<{ cantidad: number }>(
    ej,
    `SELECT COUNT(*) AS cantidad
       FROM Usuarios u
       JOIN Familias f ON f.fam_id = u.usu_fam
      WHERE u.usu_activo = 1 AND u.usu_id <> ? AND f.fam_activo = 1
        AND EXISTS (SELECT 1 FROM Familia_Patente fp JOIN Patentes p ON p.pat_id = fp.pat_id
                     WHERE fp.fam_id = f.fam_id AND p.pat_activo = 1 AND p.pat_nombre = ?)
        AND EXISTS (SELECT 1 FROM Familia_Patente fp JOIN Patentes p ON p.pat_id = fp.pat_id
                     WHERE fp.fam_id = f.fam_id AND p.pat_activo = 1 AND p.pat_nombre = ?)`,
    [excluirUsuarioId, Patente.ABM_USUARIOS, Patente.CARGA_HORAS],
  );
  return fila?.cantidad ?? 0;
}

/**
 * Aplica cambios de seguridad (familias, patentes) dentro de una transacción y los revierte si el sistema queda
 * sin ningún administrador activo. La verificación se hace sobre los datos ya modificados, así cubre cualquier
 * combinación de cambios.
 */
export function guardarSinPerderAdministradores<T>(cambios: (cx: PoolConnection) => Promise<T>): Promise<T> {
  return enTransaccion(async (cx) => {
    const resultado = await cambios(cx);
    if ((await contarAdministradores(cx, 0)) === 0) {
      throw new ReglaNegocioError(
        'El cambio dejaría al sistema sin ningún administrador activo ' +
          '(un usuario activo cuya familia tenga CARGA_HORAS y ABM_USUARIOS).',
      );
    }
    return resultado;
  });
}

/** Familia del usuario indicado, o undefined si no existe. */
export async function familiaDeUsuario(ej: Ejecutor, usuarioId: number): Promise<number | undefined> {
  const fila = await primero<{ familiaId: number }>(ej, 'SELECT usu_fam AS familiaId FROM Usuarios WHERE usu_id = ?', [
    usuarioId,
  ]);
  return fila?.familiaId;
}
