import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, mensajeDe } from '../../api/cliente';
import type { Feriado, IdGuardado } from '../../api/tipos';
import { ErrorFormulario } from '../../componentes/Abm';
import { Cargando, ErrorCarga, NoEncontrado } from '../../componentes/Estados';
import { useMensajes } from '../../componentes/Mensajes';
import { useDatos } from '../../hooks/useDatos';
import { useTitulo } from '../../hooks/useTitulo';
import { aDiaMesAnio } from '../../utils/formato';

/** Alta (/feriados/nuevo) y modificación (/feriados/:id) de un feriado. */
export function FeriadoFormulario() {
  const { id: parametroId } = useParams();
  const esNuevo = parametroId === undefined;
  const id = esNuevo ? 0 : Number(parametroId);
  const volver = (useLocation().state as { volver?: string } | null)?.volver ?? '/feriados';
  useTitulo(esNuevo ? 'Nuevo feriado' : 'Editar feriado');
  const { navegarConMensaje } = useMensajes();

  const feriado = useDatos(
    () => (esNuevo ? Promise.resolve(undefined) : api.get<Feriado>(`/feriados/${id}`)),
    [id],
  );

  const [fecha, setFecha] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (feriado.datos) {
      setFecha(feriado.datos.fecha);
      setDescripcion(feriado.datos.descripcion);
    }
  }, [feriado.datos]);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!fecha) return setError('La fecha del feriado es obligatoria.');
    if (!descripcion.trim()) return setError('La descripción del feriado es obligatoria.');

    setEnviando(true);
    try {
      if (esNuevo) await api.post<IdGuardado>('/feriados', { fecha, descripcion });
      else await api.put<IdGuardado>(`/feriados/${id}`, { fecha, descripcion });
      navegarConMensaje(volver, {
        tipo: 'exito',
        texto: `Feriado del ${aDiaMesAnio(fecha)} ${esNuevo ? 'creado' : 'modificado'}.`,
      });
    } catch (err) {
      setError(mensajeDe(err));
      setEnviando(false);
    }
  };

  if (feriado.noEncontrado) return <NoEncontrado />;
  if (feriado.error) return <ErrorCarga mensaje={feriado.error} />;
  if (!esNuevo && !feriado.datos) return <Cargando />;

  return (
    <>
      <h1 className="h4 mb-3">
        {esNuevo ? 'Nuevo feriado' : 'Editar feriado'}{' '}
        {feriado.datos && !feriado.datos.activo && (
          <span className="badge text-bg-secondary fw-normal fs-6 align-middle">Dado de baja</span>
        )}
      </h1>

      <div className="card shadow-sm formulario-abm">
        <div className="card-body">
          <form onSubmit={(e) => void guardar(e)} noValidate>
            <ErrorFormulario mensaje={error} />

            <div className="mb-3">
              <label htmlFor="fecha" className="form-label">Fecha</label>
              <input
                type="date"
                id="fecha"
                className="form-control w-auto"
                autoFocus
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>

            <div className="mb-4">
              <label htmlFor="descripcion" className="form-label">Descripción</label>
              <input
                id="descripcion"
                className="form-control"
                maxLength={100}
                autoComplete="off"
                placeholder="Ej.: Día de la Independencia"
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
