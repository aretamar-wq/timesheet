import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, mensajeDe } from '../../api/cliente';
import type { FamiliaDetalle, IdGuardado, PatenteItem } from '../../api/tipos';
import { ErrorFormulario } from '../../componentes/Abm';
import { Cargando, ErrorCarga, NoEncontrado } from '../../componentes/Estados';
import { useMensajes } from '../../componentes/Mensajes';
import { useDatos } from '../../hooks/useDatos';
import { useTitulo } from '../../hooks/useTitulo';
import { useSesion, useSesionActual } from '../../sesion/SesionContext';

/** Alta (/familias/nueva) y modificación (/familias/:id) de una familia con sus patentes. */
export function FamiliaFormulario() {
  const { id: parametroId } = useParams();
  const esNuevo = parametroId === undefined;
  const id = esNuevo ? 0 : Number(parametroId);
  const volver = (useLocation().state as { volver?: string } | null)?.volver ?? '/familias';
  useTitulo(esNuevo ? 'Nueva familia' : 'Editar familia');
  const { navegarConMensaje } = useMensajes();
  const { refrescar } = useSesion();
  const sesion = useSesionActual();
  const esPropia = !esNuevo && id === sesion.familiaId;

  const familia = useDatos(
    () => (esNuevo ? Promise.resolve(undefined) : api.get<FamiliaDetalle>(`/familias/${id}`)),
    [id],
  );
  const patentes = useDatos(() => api.get<PatenteItem[]>('/familias/patentes'), []);

  const [nombre, setNombre] = useState('');
  const [seleccionadas, setSeleccionadas] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!familia.datos) return;
    setNombre(familia.datos.nombre);
    setSeleccionadas(new Set(familia.datos.patenteIds));
  }, [familia.datos]);

  const alternar = (patenteId: number, marcada: boolean) =>
    setSeleccionadas((actual) => {
      const nuevo = new Set(actual);
      if (marcada) nuevo.add(patenteId);
      else nuevo.delete(patenteId);
      return nuevo;
    });

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!nombre.trim()) return setError('El nombre de la familia es obligatorio.');
    if (seleccionadas.size === 0) return setError('Seleccione al menos una patente.');

    setEnviando(true);
    try {
      const datos = { nombre, patenteIds: [...seleccionadas] };
      if (esNuevo) await api.post<IdGuardado>('/familias', datos);
      else await api.put<IdGuardado>(`/familias/${id}`, datos);
      // Si cambió la propia familia, el menú tiene que reflejar las patentes nuevas.
      if (esPropia) await refrescar().catch(() => undefined);
      navegarConMensaje(volver, { tipo: 'exito', texto: `Familia "${nombre.trim()}" ${esNuevo ? 'creada' : 'modificada'}.` });
    } catch (err) {
      setError(mensajeDe(err));
      setEnviando(false);
    }
  };

  if (familia.noEncontrado) return <NoEncontrado />;
  if (familia.error) return <ErrorCarga mensaje={familia.error} />;
  if (patentes.error) return <ErrorCarga mensaje={patentes.error} />;
  if ((!esNuevo && !familia.datos) || !patentes.datos) return <Cargando />;

  return (
    <>
      <h1 className="h4 mb-3">
        {esNuevo ? 'Nueva familia' : 'Editar familia'}{' '}
        {familia.datos && !familia.datos.activo && (
          <span className="badge text-bg-secondary fw-normal fs-6 align-middle">Dada de baja</span>
        )}
      </h1>

      <div className="card shadow-sm formulario-abm">
        <div className="card-body">
          <form onSubmit={(e) => void guardar(e)} noValidate>
            <ErrorFormulario mensaje={error} />

            <div className="mb-3">
              <label htmlFor="nombre" className="form-label">Nombre</label>
              <input
                id="nombre"
                className="form-control"
                maxLength={100}
                autoFocus
                autoComplete="off"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>

            <fieldset className="mb-4">
              <legend className="form-label fs-6 mb-1">Patentes</legend>
              <div className="form-text mt-0 mb-2">
                Los usuarios de la familia pueden usar las pantallas de las patentes marcadas. Sin{' '}
                <span className="font-monospace">CARGA_HORAS</span> no pueden ingresar al sistema.
                {esPropia && (
                  <span className="d-block mt-1">
                    <strong>Es su propia familia:</strong> no puede quitarle CARGA_HORAS ni ABM_USUARIOS.
                  </span>
                )}
              </div>
              <div className="list-group">
                {patentes.datos.map((p) => (
                  <label key={p.id} className="list-group-item d-flex gap-2 align-items-start" htmlFor={`patente_${p.id}`}>
                    <input
                      id={`patente_${p.id}`}
                      type="checkbox"
                      className="form-check-input flex-shrink-0 mt-1"
                      checked={seleccionadas.has(p.id)}
                      onChange={(e) => alternar(p.id, e.target.checked)}
                    />
                    <span>
                      <span className="font-monospace">{p.nombre}</span>
                      {!p.activo && <span className="badge text-bg-secondary fw-normal ms-1">dada de baja</span>}
                      <span className="d-block small text-muted">{p.descripcion}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

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
