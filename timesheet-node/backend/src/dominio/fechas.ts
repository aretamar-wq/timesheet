/**
 * Fechas sin hora como texto ISO 'yyyy-MM-dd' (igual que las devuelve la base). Los cálculos se hacen en UTC
 * para que no haya corrimientos por zona horaria ni cambios de horario.
 */

const PATRON = /^(\d{4})-(\d{2})-(\d{2})$/;

function aUtc(fecha: string): Date {
  const [, a, m, d] = PATRON.exec(fecha)!;
  return new Date(Date.UTC(Number(a), Number(m) - 1, Number(d)));
}

function aTexto(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** El texto, si es una fecha válida 'yyyy-MM-dd'; si no, undefined. */
export function parsearFecha(valor: unknown): string | undefined {
  if (typeof valor !== 'string' || !PATRON.test(valor)) return undefined;
  return aTexto(aUtc(valor)) === valor ? valor : undefined;   // descarta 2026-02-30 y similares
}

/** Hoy en la zona horaria del servidor (variable TZ). */
export function hoy(): string {
  const ahora = new Date();
  return aTexto(new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())));
}

export function sumarDias(fecha: string, dias: number): string {
  const d = aUtc(fecha);
  d.setUTCDate(d.getUTCDate() + dias);
  return aTexto(d);
}

export function sumarMeses(fecha: string, meses: number): string {
  const d = aUtc(fecha);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return aTexto(d);
}

/** Días entre dos fechas (hasta - desde). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta).getTime() - aUtc(desde).getTime()) / 86_400_000);
}

/** Lunes de la semana que contiene a la fecha (las semanas van de lunes a domingo). */
export function lunesDe(fecha: string): string {
  const diasDesdeLunes = (aUtc(fecha).getUTCDay() + 6) % 7;
  return sumarDias(fecha, -diasDesdeLunes);
}

export function primeroDelMes(fecha: string): string {
  return `${fecha.slice(0, 8)}01`;
}

/** 'yyyy-MM-dd' → 'dd/MM/yyyy' */
export function aDiaMesAnio(fecha: string): string {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}`;
}

/** 'yyyy-MM-dd' → 'yyyyMMdd' */
export function aCompacta(fecha: string): string {
  return fecha.replaceAll('-', '');
}

/** Fecha como Date a las 00:00 UTC (para Excel). */
export function aDateUtc(fecha: string): Date {
  return aUtc(fecha);
}
