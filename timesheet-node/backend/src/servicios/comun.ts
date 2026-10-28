/** Texto recortado; vacío si no es un string. */
export function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

/** "WHERE a AND b" o vacío si no hay condiciones. */
export function filtrosWhere(condiciones: string[]): string {
  return condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
}

/** Número de GLPI si el texto es solo dígitos (sin signo ni decimales); si no, undefined. */
export function comoNumeroGlpi(valor: string): number | undefined {
  if (!/^\d{1,9}$/.test(valor)) return undefined;
  return Number(valor);
}
