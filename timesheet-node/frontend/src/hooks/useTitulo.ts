import { useEffect } from 'react';
import { useSesion } from '../sesion/SesionContext';

/** Título de la pestaña: "<página> - <nombre del sistema>". */
export function useTitulo(titulo: string): void {
  const { appNombre } = useSesion();
  useEffect(() => {
    document.title = `${titulo} - ${appNombre}`;
  }, [titulo, appNombre]);
}
