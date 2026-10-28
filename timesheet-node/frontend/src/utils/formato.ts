/** Conversión HH:MM ↔ horas decimales (2:30 = 2.5) y formato de fechas 'yyyy-MM-dd'. */

/** Horas decimales a "H:MM" (2.5 → "2:30"). */
export function aHorasMinutos(horas: number): string {
  const totalMinutos = Math.round(horas * 60);
  return `${Math.floor(totalMinutos / 60)}:${String(totalMinutos % 60).padStart(2, '0')}`;
}

/** "H", "HH" o "H:MM" a horas decimales; null si no es válido. */
export function parsearDuracion(texto: string): number | null {
  const partes = texto.trim().split(':');
  if (partes.length > 2 || !/^\d+$/.test(partes[0])) return null;
  let minutos = 0;
  if (partes.length === 2) {
    if (!/^\d{2}$/.test(partes[1])) return null;
    minutos = Number(partes[1]);
    if (minutos > 59) return null;
  }
  return Math.round((Number(partes[0]) + minutos / 60) * 100) / 100;
}

/** 'yyyy-MM-dd' → 'dd/MM/yyyy' */
export function aDiaMesAnio(fecha: string): string {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}`;
}

/** Suma días a una fecha 'yyyy-MM-dd' (en UTC, sin corrimientos por zona horaria). */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Día de la semana abreviado y día/mes: 'yyyy-MM-dd' → { dia: 'Lun', fecha: '21/09' }. */
export function encabezadoDia(fecha: string): { dia: string; fecha: string } {
  const nombres = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const d = new Date(`${fecha}T00:00:00Z`);
  return { dia: nombres[d.getUTCDay()], fecha: `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}` };
}

/** Compara textos en español sin distinguir mayúsculas ni tildes. */
export function normalizarTexto(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
