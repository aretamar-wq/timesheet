import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { api, mensajeDe } from '../../api/cliente';
import type { IdGuardado, OpcionProyecto, TareaDetalle } from '../../api/tipos';
import { ErrorFormulario } from '../../componentes/Abm';
import { Cargando, ErrorCarga, NoEncontrado } from '../../componentes/Estados';
import { useMensajes } from '../../componentes/Mensajes';
import { useDatos } from '../../hooks/useDatos';
import { useTitulo } from '../../hooks/useTitulo';
import { aHorasMinutos } from '../../utils/formato';

/**
 * Alta (/tareas/nueva, opcionalmente con ?proyectoId= preseleccionado desde el filtro del listado) y modificación
 * (/tareas/:id) de una tarea. Una tarea con horas cargadas no puede cambiar de proyecto.
 */
export function TareaFormulario() {
  const { id: parametroId } = useParams();
  const [params] = useSearchParams();
  const esNuevo = parametroId === undefined;
  const id = esNuevo ? 0 : Number(parametroId);
  const volverEstado = (useLocation().state as { volver?: string } | null)?.volver;
  useTitulo(esNuevo ? 'Nueva tarea' : 'Editar tarea');
  const { navegarConMensaje } = useMensajes();

  const tarea = useDatos(
    () => (esNuevo ? Promise.resolve(undefined) : api.get<TareaDetalle>(`/tareas/${id}`)),
    [id],
  );
  // Proyectos activos que se cargan por ticket, más el que la tarea ya tenía.
  const proyectos = useDatos(
    () => api.get<OpcionProyecto[]>('/tareas/proyectos', { incluirId: tarea.datos?.proyectoId }),
    [tarea.datos?.proyectoId],
  );

  const [proyecto, setProyecto] = useState(esNuevo ? (params.get('proyectoId') ?? '') : '');
  const [glpi, setGlpi] = useState('');
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!tarea.datos) return;
    setProyecto(String(tarea.datos.proyectoId));
    setGlpi(String(tarea.datos.glpi));
    setNombre(tarea.datos.nombre);
  }, [tarea.datos]);

  // Sin listado de origen, se vuelve al listado filtrado por el proyecto.
  const volver = volverEstado ?? `/tareas${proyecto ? `?proyectoId=${proyecto}` : ''}`;

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!proyecto) return setError('Seleccione un proyecto.');
    if (!glpi) return setError('El número de ticket GLPI es obligatorio.');
    if (!nombre.trim()) return setError('La descripción de la tarea es obligatoria.');

    setEnviando(true);
    try {
      const datos = { proyectoId: Number(proyecto), glpi: Number(glpi), nombre };
      if (esNuevo) await api.post<IdGuardado>('/tareas', datos);
      else await api.put<IdGuardado>(`/tareas/${id}`, datos);
      navegarConMensaje(volver, {
        tipo: 'exito',
        texto: `Tarea GLPI ${glpi} "${nombre.trim()}" ${esNuevo ? 'creada' : 'modificada'}.`,
      });
    } catch (err) {
      setError(mensajeDe(err));
      setEnviando(false);
    }
  };

  if (tarea.noEncontrado) return <NoEncontrado />;
  if (tarea.error) return <ErrorCarga mensaje={tarea.error} />;
  if (!esNuevo && !tarea.datos) return <Cargando />;

  const horas = tarea.datos?.horasCargadas ?? null;

  return (
    <>
      <h1 className="h4 mb-3">
        {esNuevo ? 'Nueva tarea' : 'Editar tarea'}{' '}
        {tarea.datos && !tarea.datos.activo && (
          <span className="badge text-bg-secondary fw-normal fs-6 align-middle">Dada de baja</span>
        )}
      </h1>

      <div className="card shadow-sm formulario-abm">
        <div className="card-body">
          {proyectos.datos?.length === 0 && (
            <div className="alert alert-info py-2 small">
              No hay proyectos activos que se carguen por ticket GLPI. Marque "Se carga por ticket GLPI" en un proyecto
              desde el <Link to="/proyectos">ABM de Proyectos</Link>.
            </div>
          )}

          <form onSubmit={(e) => void guardar(e)} noValidate>
            <ErrorFormulario mensaje={error} />

            <div className="mb-3">
              <label htmlFor="proyectoId" className="form-label">Proyecto</label>
              <select id="proyectoId" className="form-select" value={proyecto} onChange={(e) => setProyecto(e.target.value)}>
                <option value="">Seleccione un proyecto…</option>
                {proyectos.datos?.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}{p.activo ? '' : ' (dado de baja)'}</option>
                ))}
              </select>
              {horas !== null && (
                <div className="form-text">
                  La tarea tiene {aHorasMinutos(horas)} h cargadas: no se puede cambiar de proyecto.
                </div>
              )}
            </div>

            <div className="mb-3">
              <label htmlFor="glpi" className="form-label">Nº de ticket GLPI</label>
              <input
                id="glpi"
                className="form-control"
                inputMode="numeric"
                maxLength={9}
                autoComplete="off"
                autoFocus
                value={glpi}
                // Solo dígitos (también limpia lo pegado).
                onChange={(e) => setGlpi(e.target.value.replace(/\D/g, ''))}
              />
            </div>

            <div className="mb-4">
              <label htmlFor="nombre" className="form-label">Descripción</label>
              <input
                id="nombre"
                className="form-control"
                maxLength={200}
                autoComplete="off"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
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
