import { useState, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { api, mensajeDe } from '../api/cliente';
import type { FiltroEstado } from '../api/tipos';
import { useMensajes } from './Mensajes';

/**
 * Piezas comunes de los ABM. Patrón: listado con filtros en la URL (GET), por defecto Activos; alta y modificación
 * en un solo formulario (/x/nuevo y /x/:id); baja/reactivación con confirmación, quedándose en el listado con los
 * mismos filtros; mensajes de resultado con useMensajes.
 */

export const OPCIONES_ESTADO: { valor: FiltroEstado; texto: string }[] = [
  { valor: 'activos', texto: 'Activos' },
  { valor: 'inactivos', texto: 'Dados de baja' },
  { valor: 'todos', texto: 'Todos' },
];

/**
 * Filtros del listado guardados en la URL (así "volver al listado" conserva los filtros y se pueden compartir).
 * Los campos se editan en un borrador y se aplican con "Filtrar" (submit), como en la versión anterior.
 */
export function useFiltrosUrl<T extends Record<string, string>>(porDefecto: T) {
  const [params, setParams] = useSearchParams();
  const ubicacion = useLocation();
  const aplicados = Object.fromEntries(
    Object.entries(porDefecto).map(([clave, valor]) => [clave, params.get(clave) ?? valor]),
  ) as T;
  const [borrador, setBorrador] = useState<T>(aplicados);
  const claveAplicados = JSON.stringify(aplicados);
  const [ultimaAplicada, setUltimaAplicada] = useState(claveAplicados);
  // Si la URL cambió desde afuera (link, atrás/adelante), el borrador la sigue.
  if (ultimaAplicada !== claveAplicados) {
    setUltimaAplicada(claveAplicados);
    setBorrador(aplicados);
  }

  const aplicar = (valores: T = borrador) => {
    const nuevos = new URLSearchParams();
    for (const [clave, valor] of Object.entries(valores)) {
      if (valor && valor !== porDefecto[clave]) nuevos.set(clave, valor);
    }
    setParams(nuevos);
  };
  const limpiar = () => {
    setBorrador(porDefecto);
    setParams(new URLSearchParams());
  };
  const cambiar = (clave: keyof T, valor: string) => setBorrador((b) => ({ ...b, [clave]: valor }));

  /** URL actual del listado (con filtros), para volver desde el formulario. */
  const urlListado = `${ubicacion.pathname}${ubicacion.search}`;

  return { aplicados, borrador, cambiar, aplicar, limpiar, urlListado, claveAplicados };
}

/** Barra de filtros: formulario que aplica al enviar, con botones Filtrar / Limpiar. */
export function BarraFiltros({ alFiltrar, alLimpiar, children }: {
  alFiltrar: () => void;
  alLimpiar: () => void;
  children: ReactNode;
}) {
  return (
    <form
      className="filtros-abm"
      onSubmit={(e) => {
        e.preventDefault();
        alFiltrar();
      }}
    >
      {children}
      <div className="filtro-acciones">
        <button type="submit" className="btn btn-outline-primary btn-sm">Filtrar</button>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={alLimpiar}>Limpiar</button>
      </div>
    </form>
  );
}

const OPCIONES_ESTADO_FEMENINO: { valor: FiltroEstado; texto: string }[] = [
  { valor: 'activos', texto: 'Activas' },
  { valor: 'inactivos', texto: 'Dadas de baja' },
  { valor: 'todos', texto: 'Todas' },
];

/** Filtro de estado; femenino para categorías, tareas y familias (Activas / Dadas de baja / Todas). */
export function FiltroEstadoSelect({ valor, alCambiar, femenino = false }: {
  valor: string;
  alCambiar: (valor: string) => void;
  femenino?: boolean;
}) {
  return (
    <div className="filtro-estado">
      <label htmlFor="estado" className="form-label small mb-1">Estado</label>
      <select id="estado" className="form-select form-select-sm" value={valor} onChange={(e) => alCambiar(e.target.value)}>
        {(femenino ? OPCIONES_ESTADO_FEMENINO : OPCIONES_ESTADO).map((o) => (
          <option key={o.valor} value={o.valor}>{o.texto}</option>
        ))}
      </select>
    </div>
  );
}

/** Badge "Activo" / "Dado de baja" (o "Activa" / "Dada de baja" con femenino). */
export function BadgeEstado({ activo, femenino = false }: { activo: boolean; femenino?: boolean }) {
  return activo ? (
    <span className="badge text-bg-success fw-normal">{femenino ? 'Activa' : 'Activo'}</span>
  ) : (
    <span className="badge text-bg-secondary fw-normal">{femenino ? 'Dada de baja' : 'Dado de baja'}</span>
  );
}

/**
 * Botón "Dar de baja" / "Reactivar" con confirmación. Llama a PUT {ruta}/estado y, si sale bien, muestra el
 * mensaje de éxito y recarga el listado; si no, muestra el error.
 */
export function BotonCambiarEstado({ ruta, activo, confirmarBaja, confirmarReactivar, exitoBaja, exitoReactivar, alTerminar }: {
  /** Ej. "/proyectos/5" */
  ruta: string;
  activo: boolean;
  confirmarBaja: string;
  confirmarReactivar: string;
  exitoBaja: string;
  exitoReactivar: string;
  alTerminar: () => void;
}) {
  const { mostrarExito, mostrarError } = useMensajes();
  const [enviando, setEnviando] = useState(false);

  const cambiar = async () => {
    if (!window.confirm(activo ? confirmarBaja : confirmarReactivar)) return;
    setEnviando(true);
    try {
      await api.put(`${ruta}/estado`, { activo: !activo });
      mostrarExito(activo ? exitoBaja : exitoReactivar);
      alTerminar();
    } catch (error) {
      mostrarError(mensajeDe(error));
    } finally {
      setEnviando(false);
    }
  };

  return activo ? (
    <button type="button" className="btn btn-outline-danger btn-sm" disabled={enviando} onClick={() => void cambiar()}>
      Dar de baja
    </button>
  ) : (
    <button type="button" className="btn btn-outline-success btn-sm" disabled={enviando} onClick={() => void cambiar()}>
      Reactivar
    </button>
  );
}

/** Error de validación arriba del formulario. */
export function ErrorFormulario({ mensaje }: { mensaje: string | undefined }) {
  if (!mensaje) return null;
  return <div className="alert alert-danger py-2 small">{mensaje}</div>;
}
