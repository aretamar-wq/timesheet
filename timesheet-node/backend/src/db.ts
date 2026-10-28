import mysql from 'mysql2/promise';
import type { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.puerto,
  database: config.db.nombre,
  user: config.db.usuario,
  password: config.db.password,
  charset: 'utf8mb4_unicode_520_ci',
  connectionLimit: 10,
  // DATE como 'yyyy-MM-dd' (sin conversión a Date ni corrimientos por zona horaria).
  dateStrings: true,
  // DECIMAL como number: tie_duracion son módulos de 0.5, exactos en coma flotante.
  decimalNumbers: true,
  // BOOLEAN (TINYINT(1)) como true/false.
  typeCast(campo, siguiente) {
    if (campo.type === 'TINY' && campo.length === 1) {
      const valor = campo.string();
      return valor === null ? null : valor === '1';
    }
    return siguiente();
  },
});

/** El pool o una conexión dentro de una transacción. */
export type Ejecutor = Pool | PoolConnection;

export async function consultar<T>(ej: Ejecutor, sql: string, parametros: unknown[] = []): Promise<T[]> {
  const [filas] = await ej.query(sql, parametros);
  return filas as T[];
}

export async function primero<T>(ej: Ejecutor, sql: string, parametros: unknown[] = []): Promise<T | undefined> {
  const filas = await consultar<T>(ej, sql, parametros);
  return filas[0];
}

export async function existe(ej: Ejecutor, sql: string, parametros: unknown[] = []): Promise<boolean> {
  return (await primero(ej, sql, parametros)) !== undefined;
}

export async function ejecutar(ej: Ejecutor, sql: string, parametros: unknown[] = []): Promise<ResultSetHeader> {
  const [resultado] = await ej.query(sql, parametros);
  return resultado as ResultSetHeader;
}

/** Ejecuta fn dentro de una transacción: commit si termina bien, rollback si lanza. */
export async function enTransaccion<T>(fn: (cx: PoolConnection) => Promise<T>): Promise<T> {
  const cx = await pool.getConnection();
  try {
    await cx.beginTransaction();
    const resultado = await fn(cx);
    await cx.commit();
    return resultado;
  } catch (error) {
    await cx.rollback();
    throw error;
  } finally {
    cx.release();
  }
}

/** Violación de una restricción UNIQUE (carreras entre la validación y el INSERT/UPDATE). */
export function esDuplicado(error: unknown): boolean {
  return (error as { code?: string })?.code === 'ER_DUP_ENTRY';
}

/** Patrón para LIKE que busca el texto en cualquier parte, escapando % y _. */
export function contiene(texto: string): string {
  return `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
