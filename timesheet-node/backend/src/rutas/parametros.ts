import type { Request } from 'express';
import { NoEncontradoError } from '../errores.js';

/** Entero positivo, o undefined si el valor no lo es (parámetros opcionales de query o body). */
export function enteroOpcional(valor: unknown): number | undefined {
  const texto = typeof valor === 'number' ? String(valor) : typeof valor === 'string' ? valor.trim() : '';
  if (!/^\d{1,9}$/.test(texto)) return undefined;
  const numero = Number(texto);
  return numero > 0 ? numero : undefined;
}

/** Id de la ruta (/:id). Lanza NoEncontradoError (404) si no es un entero positivo. */
export function idDeRuta(req: Request): number {
  const id = enteroOpcional(req.params.id);
  if (id === undefined) throw new NoEncontradoError();
  return id;
}

/** Texto recortado, o undefined si está vacío. */
export function textoOpcional(valor: unknown): string | undefined {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  return texto || undefined;
}

export function booleano(valor: unknown): boolean {
  return valor === true || valor === 'true' || valor === 1 || valor === '1';
}

/** Lista de enteros positivos (ignora lo que no lo sea). */
export function listaDeEnteros(valor: unknown): number[] {
  if (!Array.isArray(valor)) return [];
  return valor.map(enteroOpcional).filter((n): n is number => n !== undefined);
}

/** Enteros positivos separados por coma ("3,7,12"), sin repetidos; ignora lo que no lo sea. */
export function enterosSeparadosPorComa(valor: unknown): number[] {
  const texto = typeof valor === 'string' ? valor : '';
  return [...new Set(texto.split(',').map(enteroOpcional).filter((n): n is number => n !== undefined))];
}

/** Body del request como objeto (vacío si no vino JSON). */
export function cuerpo(req: Request): Record<string, unknown> {
  return typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : {};
}
