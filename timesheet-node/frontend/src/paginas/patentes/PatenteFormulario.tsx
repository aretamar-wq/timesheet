import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, mensajeDe } from '../../api/cliente';
import type { PatenteItem } from '../../api/tipos';
import { ErrorFormulario } from '../../componentes/Abm';
import { Cargando, ErrorCarga, NoEncontrado } from '../../componentes/Estados';
import { useMensajes } from '../../componentes/Mensajes';
import { useDatos } from '../../hooks/useDatos';
import { useTitulo } from '../../hooks/useTitulo';

/** Edición de la descripción de una patente (/patentes/:id). El nombre lo usa el código y no se puede cambiar. */
export function PatenteFormulario() {
  const { id: parametroId } = useParams();
  const id = Number(parametroId);
  const volver = (useLocation().state as { volver?: string } | null)?.volver ?? '/patentes';
  useTitulo('Editar patente');
  const { navegarConMensaje } = useMensajes();

  const patente = useDatos(() => api.get<PatenteItem>(`/patentes/${id}`), [id]);

  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (patente.datos) setDescripcion(patente.datos.descripcion ?? '');
  }, [patente.datos]);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setEnviando(true);
    try {
      await api.put(`/patentes/${id}`, { descripcion });
      navegarConMensaje(volver, { tipo: 'exito', texto: `Patente ${patente.datos?.nombre ?? ''} modificada.` });
    } catch (err) {
      setError(mensajeDe(err));
      setEnviando(false);
    }
  };

  if (patente.noEncontrado) return <NoEncontrado />;
  if (patente.error) return <ErrorCarga mensaje={patente.error} />;
  if (!patente.datos) return <Cargando />;

  return (
    <>
      <h1 className="h4 mb-3">Editar patente</h1>

      <div className="card shadow-sm formulario-abm">
        <div className="card-body">
          <form onSubmit={(e) => void guardar(e)} noValidate>
            <ErrorFormulario mensaje={error} />

            <div className="mb-3">
              <label htmlFor="nombre" className="form-label">Nombre</label>
              <input id="nombre" className="form-control font-monospace" readOnly value={patente.datos.nombre} />
              <div className="form-text">El nombre se usa en el código del sistema y no se puede cambiar.</div>
            </div>

            <div className="mb-4">
              <label htmlFor="descripcion" className="form-label">Descripción</label>
              <input
                id="descripcion"
                className="form-control"
                maxLength={250}
                autoComplete="off"
                autoFocus
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>

            <div className="d-flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={enviando}>Guardar</button>
              <Link className="btn btn-outline-secondary" to={volver}>Cancelar</Link>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
