/**
 * Máscara y validación de las celdas de la grilla. El usuario escribe solo números; los dos puntos se insertan
 * solos (130 → 1:30, 8 → 8:00). Módulos de 30 minutos, máximo 24:00 por celda (se valida también en el servidor
 * y en la base).
 */

export const MODULO_MIN = 30;
export const MAX_MIN = 24 * 60;

export function soloDigitos(texto: string): string {
  return (texto || '').replace(/\D/g, '').slice(0, 4);
}

/** Formato mientras se escribe: hasta 2 dígitos son horas; con 3 o 4 los dos últimos son minutos. */
export function aplicarMascara(digitos: string): string {
  return digitos.length <= 2 ? digitos : `${digitos.slice(0, -2)}:${digitos.slice(-2)}`;
}

/** Minutos de un texto (vacío = 0). Lanza Error con un mensaje para el usuario si no es válido. */
export function interpretar(texto: string): number {
  const d = soloDigitos(texto);
  if (!d) return 0;
  const horas = parseInt(d.length <= 2 ? d : d.slice(0, -2), 10);
  const minutos = d.length <= 2 ? 0 : parseInt(d.slice(-2), 10);
  if (minutos !== 0 && minutos !== 30) throw new Error('Los minutos deben ser :00 o :30 (módulos de 30 minutos).');
  const total = horas * 60 + minutos;
  if (total % MODULO_MIN !== 0) throw new Error('Las horas se cargan en módulos de 30 minutos.');
  if (total > MAX_MIN) throw new Error('El máximo por celda es 24:00.');
  return total;
}

/** Minutos del texto, o 0 si no es válido (para los totales). */
export function minutosSeguros(texto: string): number {
  try {
    return interpretar(texto);
  } catch {
    return 0;
  }
}

/** Minutos a "H:MM" (0 = vacío). */
export function minutosATexto(minutos: number): string {
  if (!minutos) return '';
  return `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, '0')}`;
}

/** Horas decimales (de la API) a "H:MM"; null o 0 = vacío. */
export function horasATexto(horas: number | null | undefined): string {
  return horas ? minutosATexto(Math.round(horas * 60)) : '';
}

/** "Descripción (GLPI 123)" */
export function textoTarea(nombre: string | null, glpi: number | null): string {
  if (!nombre) return '';
  return glpi ? `${nombre} (GLPI ${glpi})` : nombre;
}
