import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { PatenteCodigo } from '../api/tipos';
import { useTitulo } from '../hooks/useTitulo';
import { useSesion } from '../sesion/SesionContext';

/** Muestra la página solo si el usuario tiene la patente; si no, "Sin permiso" (equivalente al 403). */
export function RequierePatente({ patente, children }: { patente: PatenteCodigo; children: ReactNode }) {
  const { tienePatente } = useSesion();
  return tienePatente(patente) ? <>{children}</> : <SinPermiso />;
}

export function SinPermiso() {
  useTitulo('Sin permiso');
  return (
    <div className="py-4">
      <h1 className="h4">Sin permiso</h1>
      <p className="text-muted">No tiene permiso para acceder a esta sección.</p>
      <Link to="/">Volver a la carga de horas</Link>
    </div>
  );
}

export function NoEncontrado() {
  useTitulo('No encontrado');
  return (
    <div className="py-4">
      <h1 className="h4">No encontrado</h1>
      <p className="text-muted">La página o el registro que busca no existe.</p>
      <Link to="/">Volver a la carga de horas</Link>
    </div>
  );
}

export function Cargando() {
  return (
    <div className="py-4 text-muted d-flex align-items-center gap-2">
      <span className="spinner-border spinner-border-sm" aria-hidden="true" />
      Cargando…
    </div>
  );
}

/** Error al cargar los datos de una página. */
export function ErrorCarga({ mensaje }: { mensaje: string }) {
  return <div className="alert alert-danger py-2">{mensaje}</div>;
}
