import { Link } from 'react-router-dom';
import { api } from '../../api/cliente';
import type { Familia, UsuarioListado } from '../../api/tipos';
import { BadgeEstado, BarraFiltros, BotonCambiarEstado, FiltroEstadoSelect, useFiltrosUrl } from '../../componentes/Abm';
import { Cargando, ErrorCarga } from '../../componentes/Estados';
import { useDatos } from '../../hooks/useDatos';
import { useTitulo } from '../../hooks/useTitulo';
import { useSesionActual } from '../../sesion/SesionContext';

/** ABM de Usuarios: listado con filtros por login/nombre, familia y estado. */
export function UsuariosListado() {
  useTitulo('Usuarios');
  const sesion = useSesionActual();
  const filtros = useFiltrosUrl({ texto: '', familiaId: '', estado: 'activos' });
  const { aplicados, borrador, cambiar } = filtros;

  // Familias activas, más la filtrada aunque esté dada de baja.
  const familias = useDatos(
    () => api.get<Familia[]>('/usuarios/familias', { incluirId: aplicados.familiaId }),
    [aplicados.familiaId],
  );
  const usuarios = useDatos(() => api.get<UsuarioListado[]>('/usuarios', aplicados), [filtros.claveAplicados]);
  const volver = { volver: filtros.urlListado };

  return (
    <>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <h1 className="h4 mb-0">Usuarios</h1>
        <Link className="btn btn-primary btn-sm ms-2" to="/usuarios/nuevo" state={volver}>Nuevo usuario</Link>
      </div>

      <BarraFiltros alFiltrar={() => filtros.aplicar()} alLimpiar={filtros.limpiar}>
        <div className="filtro-texto">
          <label htmlFor="texto" className="form-label small mb-1">Usuario de red o nombre</label>
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
          <label htmlFor="familiaId" className="form-label small mb-1">Familia</label>
          <select
            id="familiaId"
            className="form-select form-select-sm"
            value={borrador.familiaId}
            onChange={(e) => cambiar('familiaId', e.target.value)}
          >
            <option value="">Todas</option>
            {familias.datos?.map((f) => (
              <option key={f.id} value={f.id}>{f.nombre}{f.activo ? '' : ' (dada de baja)'}</option>
            ))}
          </select>
        </div>
        <FiltroEstadoSelect valor={borrador.estado} alCambiar={(v) => cambiar('estado', v)} />
      </BarraFiltros>

      {usuarios.error && <ErrorCarga mensaje={usuarios.error} />}
      {usuarios.cargando && !usuarios.datos && <Cargando />}
      {usuarios.datos && (
        <>
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle bg-white w-auto tabla-abm">
              <thead className="table-light">
                <tr>
                  <th>Nombre</th>
                  <th>Usuario de red</th>
                  <th>Familia</th>
                  <th className="text-center">Estado</th>
                  <th><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {usuarios.datos.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-muted py-4">No hay usuarios que coincidan con el filtro.</td>
                  </tr>
                )}
                {usuarios.datos.map((u) => {
                  const esPropio = u.id === sesion.usuarioId;
                  return (
                    <tr key={u.id} className={u.activo ? '' : 'text-muted'}>
                      <td>
                        {u.nombre}
                        {esPropio && <span className="badge text-bg-info fw-normal ms-1">usted</span>}
                      </td>
                      <td className="font-monospace">{u.login}</td>
                      <td>
                        {u.familia}
                        {!u.familiaActiva && (
                          <span className="badge text-bg-secondary fw-normal ms-1">familia dada de baja</span>
                        )}
                      </td>
                      <td className="text-center"><BadgeEstado activo={u.activo} /></td>
                      <td className="text-nowrap">
                        <Link className="btn btn-outline-secondary btn-sm me-1" to={`/usuarios/${u.id}`} state={volver}>
                          Editar
                        </Link>
                        {!esPropio && (
                          <BotonCambiarEstado
                            ruta={`/usuarios/${u.id}`}
                            activo={u.activo}
                            confirmarBaja={`¿Dar de baja a ${u.nombre}? Ya no podrá ingresar; sus horas cargadas se conservan.`}
                            confirmarReactivar={`¿Reactivar a ${u.nombre}?`}
                            exitoBaja="Usuario dado de baja: ya no puede ingresar. Sus horas cargadas se conservan."
                            exitoReactivar="Usuario reactivado."
                            alTerminar={usuarios.recargar}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small text-muted">{usuarios.datos.length} usuario(s).</p>
        </>
      )}
    </>
  );
}
