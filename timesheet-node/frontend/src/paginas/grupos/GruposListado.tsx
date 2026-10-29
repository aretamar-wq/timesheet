import { Link } from 'react-router-dom';
import { api } from '../../api/cliente';
import type { GrupoListado } from '../../api/tipos';
import { BadgeEstado, BarraFiltros, BotonCambiarEstado, FiltroEstadoSelect, useFiltrosUrl } from '../../componentes/Abm';
import { Cargando, ErrorCarga } from '../../componentes/Estados';
import { useDatos } from '../../hooks/useDatos';
import { useTitulo } from '../../hooks/useTitulo';

/** ABM de Grupos: listado con filtros por nombre y estado. Los grupos se usan para filtrar los reportes. */
export function GruposListado() {
  useTitulo('Grupos');
  const filtros = useFiltrosUrl({ texto: '', estado: 'activos' });
  const { aplicados, borrador, cambiar } = filtros;

  const grupos = useDatos(() => api.get<GrupoListado[]>('/grupos', aplicados), [filtros.claveAplicados]);
  const volver = { volver: filtros.urlListado };

  return (
    <>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <h1 className="h4 mb-0">Grupos</h1>
        <Link className="btn btn-primary btn-sm ms-2" to="/grupos/nuevo" state={volver}>Nuevo grupo</Link>
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
        <FiltroEstadoSelect valor={borrador.estado} alCambiar={(v) => cambiar('estado', v)} />
      </BarraFiltros>

      {grupos.error && <ErrorCarga mensaje={grupos.error} />}
      {grupos.cargando && !grupos.datos && <Cargando />}
      {grupos.datos && (
        <>
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle bg-white w-auto tabla-abm">
              <thead className="table-light">
                <tr>
                  <th>Nombre</th>
                  <th className="text-center">Usuarios activos</th>
                  <th className="text-center">Estado</th>
                  <th><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {grupos.datos.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-muted py-4">No hay grupos que coincidan con el filtro.</td>
                  </tr>
                )}
                {grupos.datos.map((g) => (
                  <tr key={g.id} className={g.activo ? '' : 'text-muted'}>
                    <td>{g.nombre}</td>
                    <td className="text-center">{g.usuariosActivos}</td>
                    <td className="text-center"><BadgeEstado activo={g.activo} /></td>
                    <td className="text-nowrap">
                      <Link className="btn btn-outline-secondary btn-sm me-1" to={`/grupos/${g.id}`} state={volver}>
                        Editar
                      </Link>
                      <BotonCambiarEstado
                        ruta={`/grupos/${g.id}`}
                        activo={g.activo}
                        confirmarBaja={`¿Dar de baja el grupo "${g.nombre}"? Sus usuarios se conservan; las horas ya cargadas no se modifican.`}
                        confirmarReactivar={`¿Reactivar el grupo "${g.nombre}"?`}
                        exitoBaja="Grupo dado de baja."
                        exitoReactivar="Grupo reactivado."
                        alTerminar={grupos.recargar}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small text-muted">{grupos.datos.length} grupo(s).</p>
        </>
      )}
    </>
  );
}
