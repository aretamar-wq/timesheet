/** Conversión entre el formato que tipea el usuario (H:MM) y el decimal que se guarda en tie_duracion. */

/** Convierte "H", "HH" o "H:MM" a horas decimales redondeadas a 2 decimales (2:30 = 2.5). null si no es válido. */
export function parsearDuracion(texto: string): number | null {
  const partes = texto.trim().split(':');
  if (partes.length > 2 || !/^\d+$/.test(partes[0])) return null;

  const horas = Number(partes[0]);
  let minutos = 0;
  if (partes.length === 2) {
    if (!/^\d{2}$/.test(partes[1])) return null;
    minutos = Number(partes[1]);
    if (minutos > 59) return null;
  }
  return Math.round((horas + minutos / 60) * 100) / 100;
}

/** Convierte horas decimales a "H:MM" (2.5 = "2:30"). */
export function aHorasMinutos(horas: number): string {
  const totalMinutos = Math.round(horas * 60);
  return `${Math.floor(totalMinutos / 60)}:${String(totalMinutos % 60).padStart(2, '0')}`;
}
