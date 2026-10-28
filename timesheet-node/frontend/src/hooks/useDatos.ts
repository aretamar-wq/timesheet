import { useCallback, useEffect, useState } from 'react';
import { ApiError, mensajeDe } from '../api/cliente';

export interface EstadoDatos<T> {
  datos: T | undefined;
  /** Mensaje si falló la carga. */
  error: string | undefined;
  /** true si la API respondió 404. */
  noEncontrado: boolean;
  cargando: boolean;
  recargar: () => void;
}

/**
 * Carga datos de la API cuando cambian las dependencias (p. ej. los filtros de la URL). Descarta respuestas de
 * pedidos viejos si las dependencias cambiaron mientras tanto.
 */
export function useDatos<T>(cargar: () => Promise<T>, dependencias: unknown[]): EstadoDatos<T> {
  const [datos, setDatos] = useState<T>();
  const [error, setError] = useState<string>();
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [version, setVersion] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cargarMemo = useCallback(cargar, dependencias);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(undefined);
    setNoEncontrado(false);
    cargarMemo()
      .then((d) => vigente && setDatos(d))
      .catch((e: unknown) => {
        if (!vigente) return;
        if (e instanceof ApiError && e.estado === 404) setNoEncontrado(true);
        else setError(mensajeDe(e));
      })
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [cargarMemo, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { datos, error, noEncontrado, cargando, recargar };
}
