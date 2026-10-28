import { Link } from 'react-router-dom';
import { api } from '../../api/cliente';
import type { OpcionProyecto, TareaListado } from '../../api/tipos';
import { BadgeEstado, BarraFiltros, BotonCambiarEstado, FiltroEstadoSelect, useFiltrosUrl } from '../../componentes/Abm';
import { Cargando, ErrorCarga } from '../../componentes/Estados';
import { useDatos } from '../../hooks/useDatos';
import { useTitulo } from '../../hooks/useTitulo';
import { aHorasMinutos } from '../../utils/formato';

/**
 * ABM de Tareas (tickets GLPI): listado con filtros por texto (descripción, o GLPI exacto si es un número),
 * proyecto y estado. Ordenado por GLPI descendente.
 */
export function TareasListado() {
  useTitulo('Tareas');
  const filtros = useFiltrosUrl({ texto: '', proyectoId: '', estado: 'activos' });
  const { aplicados, borrador, cambiar } = filtros;

  // Todos los proyectos que se cargan por ticket (también los dados de baja), para el filtro.
  const proyectos = useDatos(() => api.get<OpcionProyecto[]>('/tareas/proyectos', { todos: 1 }), []);
  const tareas = useDatos(() => api.get<TareaListado[]>('/tareas', aplicados), [filtros.claveAplicados]);
  const volver = { volver: filtros.urlListado };

  return (
    <>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <h1 className="h4 mb-0">
          Tareas <span className="text-muted fs-6 fw-normal">(tickets GLPI)</span>
        </h1>
        <Link
          className="btn btn-primary btn-sm ms-2"
          to={`/tareas/nueva${aplicados.proyectoId ? `?proyectoId=${aplicados.proyectoId}` : ''}`}
          state={volver}
        >
          Nueva tarea
        </Link>
      </div>

      <BarraFiltros alFiltrar={() => filtros.aplicar()} alLimpiar={filtros.limpiar}>
        <div className="filtro-texto">
          <label htmlFor="texto" className="form-label small mb-1">GLPI o descripción</label>
          <input
            type="search"
            id="texto"
            className="form-control form-control-sm"
            placeholder="Buscar…"
            value={borrador.texto}
            onChange={(e) => cambiar('texto', e.target.value)}
          />
        </div>
        <div className="filtro-combo filtro-combo-ancho">
          <label htmlFor="proyectoId" className="form-label small mb-1">Proyecto</label>
          <select
            id="proyectoId"
            className="form-select form-select-sm"
            value={borrador.proyectoId}
            onChange={(e) => cambiar('proyectoId', e.target.value)}
          >
            <option value="">Todos</option>
            {proyectos.datos?.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}{p.activo ? '' : ' (dado de baja)'}</option>
            ))}
          </select>
        </div>
        <FiltroEstadoSelect femenino valor={borrador.estado} alCambiar={(v) => cambiar('estado', v)} />
      </BarraFiltros>

      {proyectos.datos?.length === 0 && (
        <div className="alert alert-info py-2 small">
          No hay proyectos que se carguen por ticket GLPI. Las tareas solo existen en esos proyectos: marque "Se carga
          por ticket GLPI" en el <Link to="/proyectos">ABM de Proyectos</Link>.
        </div>
      )}

      {tareas.error && <ErrorCarga mensaje={tareas.error} />}
      {tareas.cargando && !tareas.datos && <Cargando />}
      {tareas.datos && (
        <>
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle bg-white w-auto tabla-abm">
              <thead className="table-light">
                <tr>
                  <th className="text-end">GLPI</th>
                  <th>Descripción</th>
                  <th>Proyecto</th>
                  <th className="text-end">Horas cargadas</th>
                  <th className="text-center">Estado</th>
                  <th><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {tareas.datos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-muted py-4">No hay tareas que coincidan con el filtro.</td>
                  </tr>
                )}
                {tareas.datos.map((t) => (
                  <tr key={t.id} className={t.activo ? '' : 'text-muted'}>
                    <td className="text-end font-monospace">{t.glpi}</td>
                    <td>{t.nombre}</td>
                    <td>
                      {t.proyecto}
                      {!t.proyectoActivo && (
                        <span className="badge text-bg-secondary fw-normal ms-1">proyecto dado de baja</span>
                      )}
                    </td>
                    <td className="text-end">{t.horas !== null ? aHorasMinutos(t.horas) : '—'}</td>
                    <td className="text-center"><BadgeEstado activo={t.activo} femenino /></td>
                    <td className="text-nowrap">
                      <Link className="btn btn-outline-secondary btn-sm me-1" to={`/tareas/${t.id}`} state={volver}>
                        Editar
                      </Link>
                      <BotonCambiarEstado
                        ruta={`/tareas/${t.id}`}
                        activo={t.activo}
                        confirmarBaja={`¿Dar de baja la tarea GLPI ${t.glpi} "${t.nombre}"? Las horas ya cargadas se conservan.`}
                        confirmarReactivar={`¿Reactivar la tarea GLPI ${t.glpi} "${t.nombre}"?`}
                        exitoBaja="Tarea dada de baja. Las horas ya cargadas se conservan."
                        exitoReactivar="Tarea reactivada."
                        alTerminar={tareas.recargar}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small text-muted">{tareas.datos.length} tarea(s).</p>
        </>
      )}
    </>
  );
}
