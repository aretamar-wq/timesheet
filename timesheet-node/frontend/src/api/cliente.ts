/** Error devuelto por la API. mensaje es apto para mostrarle al usuario. */
export class ApiError extends Error {
  readonly estado: number;

  constructor(estado: number, mensaje: string) {
    super(mensaje);
    this.name = 'ApiError';
    this.estado = estado;
  }
}

/** Se llama cuando la API responde 401 (sesión vencida o usuario dado de baja). Lo registra SesionProvider. */
let alPerderSesion: (() => void) | undefined;
export function registrarPerdidaDeSesion(fn: () => void): void {
  alPerderSesion = fn;
}

type Parametros = Record<string, string | number | boolean | null | undefined>;

/** Query string sin los parámetros vacíos. */
export function queryString(parametros: Parametros = {}): string {
  const qs = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor !== undefined && valor !== null && valor !== '') qs.set(clave, String(valor));
  }
  const texto = qs.toString();
  return texto ? `?${texto}` : '';
}

async function pedir<T>(metodo: string, ruta: string, body?: unknown): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`/api${ruta}`, {
      method: metodo,
      credentials: 'same-origin',
      headers: {
        // El backend exige este header en los métodos que modifican datos (protección CSRF).
        'X-Requested-With': 'fetch',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No se pudo contactar al servidor. Verifique la conexión.');
  }

  if (respuesta.status === 204) return undefined as T;
  const datos = await respuesta.json().catch(() => undefined);
  if (respuesta.ok) return datos as T;

  if (respuesta.status === 401 && !ruta.startsWith('/auth/')) alPerderSesion?.();
  const mensaje = (datos as { mensaje?: string } | undefined)?.mensaje ?? `Error ${respuesta.status}.`;
  throw new ApiError(respuesta.status, mensaje);
}

export const api = {
  get: <T>(ruta: string, parametros?: Parametros) => pedir<T>('GET', `${ruta}${queryString(parametros)}`),
  post: <T>(ruta: string, body: unknown = {}) => pedir<T>('POST', ruta, body),
  put: <T>(ruta: string, body: unknown = {}) => pedir<T>('PUT', ruta, body),
};

/** Mensaje de un error cualquiera, para mostrar. */
export function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
}
