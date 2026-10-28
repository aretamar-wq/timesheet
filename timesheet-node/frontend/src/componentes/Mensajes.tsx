import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Mensajes de resultado (éxito / error) que el Layout muestra arriba del contenido, como TempData en la versión
 * anterior. mostrarExito/mostrarError los muestran en la página actual; navegarConMensaje los muestra en la página
 * de destino (patrón "guardar y volver al listado"). Cualquier otra navegación los borra.
 */

export interface Mensaje {
  tipo: 'exito' | 'error';
  texto: string;
}

interface ContextoMensajes {
  mensaje: Mensaje | undefined;
  mostrarExito: (texto: string) => void;
  mostrarError: (texto: string) => void;
  cerrar: () => void;
  /** Navega a la ruta y muestra el mensaje allí. */
  navegarConMensaje: (ruta: string, mensaje: Mensaje) => void;
}

const Contexto = createContext<ContextoMensajes | undefined>(undefined);

export function MensajesProvider({ children }: { children: ReactNode }) {
  const [mensaje, setMensaje] = useState<Mensaje | undefined>();
  const conservarEnProximaNavegacion = useRef(false);
  const ubicacion = useLocation();
  const navegar = useNavigate();

  useEffect(() => {
    if (conservarEnProximaNavegacion.current) conservarEnProximaNavegacion.current = false;
    else setMensaje(undefined);
  }, [ubicacion.key]);

  const navegarConMensaje = useCallback(
    (ruta: string, nuevo: Mensaje) => {
      conservarEnProximaNavegacion.current = true;
      setMensaje(nuevo);
      navegar(ruta);
    },
    [navegar],
  );

  const valor = useMemo<ContextoMensajes>(
    () => ({
      mensaje,
      mostrarExito: (texto) => setMensaje({ tipo: 'exito', texto }),
      mostrarError: (texto) => setMensaje({ tipo: 'error', texto }),
      cerrar: () => setMensaje(undefined),
      navegarConMensaje,
    }),
    [mensaje, navegarConMensaje],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useMensajes(): ContextoMensajes {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useMensajes fuera de MensajesProvider.');
  return contexto;
}

/** Alerta con el mensaje actual (la ubica el Layout). */
export function VisorMensajes() {
  const { mensaje, cerrar } = useMensajes();
  if (!mensaje) return null;
  return (
    <div className={`alert ${mensaje.tipo === 'exito' ? 'alert-success' : 'alert-danger'} alert-dismissible py-2`} role="alert">
      {mensaje.texto}
      <button type="button" className="btn-close py-2" aria-label="Cerrar" onClick={cerrar} />
    </div>
  );
}
