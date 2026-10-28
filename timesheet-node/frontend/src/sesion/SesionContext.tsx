import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, registrarPerdidaDeSesion } from '../api/cliente';
import type { PatenteCodigo, Sesion } from '../api/tipos';

interface ContextoSesion {
  /** undefined mientras se consulta; null si no hay sesión. */
  sesion: Sesion | null | undefined;
  appNombre: string;
  tienePatente: (patente: PatenteCodigo) => boolean;
  ingresar: (login: string, password: string) => Promise<void>;
  salir: () => Promise<void>;
  /** Vuelve a leer la sesión (p. ej. después de cambiar la propia familia). */
  refrescar: () => Promise<void>;
}

const Contexto = createContext<ContextoSesion | undefined>(undefined);

/** Sesión del usuario: la cookie es httpOnly, así que se consulta /api/auth/sesion al iniciar. */
export function SesionProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null | undefined>(undefined);
  const [appNombre, setAppNombre] = useState('Timesheet');

  const refrescar = useCallback(async () => {
    try {
      setSesion(await api.get<Sesion>('/auth/sesion'));
    } catch (error) {
      if (error instanceof ApiError && error.estado === 401) setSesion(null);
      else throw error;
    }
  }, []);

  useEffect(() => {
    registrarPerdidaDeSesion(() => setSesion(null));
    api.get<{ appNombre: string }>('/auth/config').then((c) => setAppNombre(c.appNombre)).catch(() => undefined);
    refrescar().catch(() => setSesion(null));
  }, [refrescar]);

  const valor = useMemo<ContextoSesion>(
    () => ({
      sesion,
      appNombre,
      tienePatente: (patente) => !!sesion?.patentes.includes(patente),
      ingresar: async (login, password) => {
        setSesion(await api.post<Sesion>('/auth/login', { login, password }));
      },
      salir: async () => {
        await api.post('/auth/logout').catch(() => undefined);
        setSesion(null);
      },
      refrescar,
    }),
    [sesion, appNombre, refrescar],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): ContextoSesion {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useSesion fuera de SesionProvider.');
  return contexto;
}

/** Sesión del usuario logueado (solo en páginas protegidas, donde siempre existe). */
export function useSesionActual(): Sesion {
  const { sesion } = useSesion();
  if (!sesion) throw new Error('useSesionActual sin sesión.');
  return sesion;
}
