import { Link } from 'react-router-dom';
import { api } from '../../api/cliente';
import { Patente, type Categoria, type ProyectoListado } from '../../api/tipos';
import { BadgeEstado, BarraFiltros, BotonCambiarEstado, FiltroEstadoSelect, useFiltrosUrl } from '../../componentes/Abm';
import { Cargando, ErrorCarga } from '../../componentes/Estados';
import { useDatos } from '../../hooks/useDatos';
import { useTitulo } from '../../hooks/useTitulo';
import { useSesion } from '../../sesion/SesionContext';

/** ABM de Proyectos: listado con filtros por nombre, categoría y estado. */
export function ProyectosListado() {
  useTitulo('Proyectos');
  const { tienePatente } = useSesion();
  const filtros = useFiltrosUrl({ texto: '', categoriaId: '', estado: 'activos' });
  const { aplicados, borrador, cambiar } = filtros;

  const categorias = useDatos(() => api.get<Categoria[]>('/proyectos/categorias', { todas: 1 }), []);
  const proyectos = useDatos(() => api.get<ProyectoListado[]>('/proyectos', aplicados), [filtros.claveAplicados]);
  const volver = { volver: filtros.urlListado };

  return (
    <>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <h1 className="h4 mb-0">Proyectos</h1>
        <Link className="btn btn-primary btn-sm ms-2" to="/proyectos/nuevo" state={volver}>Nuevo proyecto</Link>
      </div>

      <BarraFiltros alFiltrar={() => filtros.aplicar()} alLimpiar={filtros.limpiar}>
        <div className="filtro-texto">
          <label htmlFor="texto" className="form-label small mb-1">Nombre</label>
          <input
            type="search"
            id="texto"
            className="form-control form-control-sm"
            placeholder="Buscar…"
            value={borrador.texto}
            onChange={(e) => cambiar('texto', e.target.value)}
          />
        </div>
        <div className="filtro-combo">
          <label htmlFor="categoriaId" className="form-label small mb-1">Categoría</label>
          <select
            id="categoriaId"
            className="form-select form-select-sm"
            value={borrador.categoriaId}
            onChange={(e) => cambiar('categoriaId', e.target.value)}
          >
            <option value="">Todas</option>
            {categorias.datos?.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}{c.activo ? '' : ' (dada de baja)'}</option>
            ))}
          </select>
        </div>
        <FiltroEstadoSelect valor={borrador.estado} alCambiar={(v) => cambiar('estado', v)} />
      </BarraFiltros>

      {proyectos.error && <ErrorCarga mensaje={proyectos.error} />}
      {proyectos.cargando && !proyectos.datos && <Cargando />}
      {proyectos.datos && (
        <>
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle bg-white w-auto tabla-abm">
              <thead className="table-light">
                <tr>
                  <th>Nombre</th>
                  <th>Categoría</th>
                  <th className="text-center">Por ticket GLPI</th>
                  <th className="text-center">Tareas activas</th>
                  <th className="text-center">Estado</th>
                  <th><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {proyectos.datos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-muted py-4">No hay proyectos que coincidan con el filtro.</td>
                  </tr>
                )}
                {proyectos.datos.map((p) => (
                  <tr key={p.id} className={p.activo ? '' : 'text-muted'}>
                    <td>{p.nombre}</td>
                    <td>{p.categoria}</td>
                    <td className="text-center">{p.usaGlpi ? 'Sí' : '—'}</td>
                    <td className="text-center">
                      {!p.usaGlpi ? '—' : tienePatente(Patente.ABM_TAREAS) ? (
                        <Link to={`/tareas?proyectoId=${p.id}`} title="Ver tareas del proyecto">{p.tareasActivas}</Link>
                      ) : (
                        p.tareasActivas
                      )}
                    </td>
                    <td className="text-center"><BadgeEstado activo={p.activo} /></td>
                    <td className="text-nowrap">
                      <Link className="btn btn-outline-secondary btn-sm me-1" to={`/proyectos/${p.id}`} state={volver}>
                        Editar
                      </Link>
                      <BotonCambiarEstado
                        ruta={`/proyectos/${p.id}`}
                        activo={p.activo}
                        confirmarBaja={`¿Dar de baja el proyecto "${p.nombre}"? Las horas ya cargadas se conservan.`}
                        confirmarReactivar={`¿Reactivar el proyecto "${p.nombre}"?`}
                        exitoBaja="Proyecto dado de baja. Las horas ya cargadas se conservan."
                        exitoReactivar="Proyecto reactivado."
                        alTerminar={proyectos.recargar}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small text-muted">{proyectos.datos.length} proyecto(s).</p>
        </>
      )}
    </>
  );
}
