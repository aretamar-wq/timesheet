import { Link } from 'react-router-dom';
import { api } from '../../api/cliente';
import { Patente, type FamiliaListado } from '../../api/tipos';
import { BadgeEstado, BarraFiltros, BotonCambiarEstado, FiltroEstadoSelect, useFiltrosUrl } from '../../componentes/Abm';
import { Cargando, ErrorCarga } from '../../componentes/Estados';
import { useDatos } from '../../hooks/useDatos';
import { useTitulo } from '../../hooks/useTitulo';
import { useSesion, useSesionActual } from '../../sesion/SesionContext';

/** ABM de Familias: listado con filtros por nombre y estado. La familia del usuario logueado aparece marcada. */
export function FamiliasListado() {
  useTitulo('Familias');
  const { tienePatente } = useSesion();
  const sesion = useSesionActual();
  const verUsuarios = tienePatente(Patente.ABM_USUARIOS);
  const filtros = useFiltrosUrl({ texto: '', estado: 'activos' });
  const { aplicados, borrador, cambiar } = filtros;

  const familias = useDatos(() => api.get<FamiliaListado[]>('/familias', aplicados), [filtros.claveAplicados]);
  const volver = { volver: filtros.urlListado };

  return (
    <>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <h1 className="h4 mb-0">Familias</h1>
        <Link className="btn btn-primary btn-sm ms-2" to="/familias/nueva" state={volver}>Nueva familia</Link>
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
        <FiltroEstadoSelect femenino valor={borrador.estado} alCambiar={(v) => cambiar('estado', v)} />
      </BarraFiltros>

      {familias.error && <ErrorCarga mensaje={familias.error} />}
      {familias.cargando && !familias.datos && <Cargando />}
      {familias.datos && (
        <>
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle bg-white w-auto tabla-abm">
              <thead className="table-light">
                <tr>
                  <th>Nombre</th>
                  <th className="text-center">Patentes activas</th>
                  <th className="text-center">Usuarios activos</th>
                  <th className="text-center">Estado</th>
                  <th><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {familias.datos.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-muted py-4">No hay familias que coincidan con el filtro.</td>
                  </tr>
                )}
                {familias.datos.map((f) => {
                  const esPropia = f.id === sesion.familiaId;
                  return (
                    <tr key={f.id} className={f.activo ? '' : 'text-muted'}>
                      <td>
                        {f.nombre}
                        {esPropia && <span className="badge text-bg-info fw-normal ms-1">su familia</span>}
                      </td>
                      <td className="text-center">{f.patentesActivas}</td>
                      <td className="text-center">
                        {verUsuarios && f.usuariosActivos > 0 ? (
                          <Link to={`/usuarios?familiaId=${f.id}`} title="Ver usuarios de la familia">{f.usuariosActivos}</Link>
                        ) : (
                          f.usuariosActivos
                        )}
                      </td>
                      <td className="text-center"><BadgeEstado activo={f.activo} femenino /></td>
                      <td className="text-nowrap">
                        <Link className="btn btn-outline-secondary btn-sm me-1" to={`/familias/${f.id}`} state={volver}>
                          Editar
                        </Link>
                        {!esPropia && (
                          <BotonCambiarEstado
                            ruta={`/familias/${f.id}`}
                            activo={f.activo}
                            confirmarBaja={
                              `¿Dar de baja la familia "${f.nombre}"?` +
                              (f.usuariosActivos > 0
                                ? ` Sus ${f.usuariosActivos} usuario(s) activo(s) ya no podrán ingresar.`
                                : '')
                            }
                            confirmarReactivar={`¿Reactivar la familia "${f.nombre}"?`}
                            exitoBaja="Familia dada de baja: sus usuarios ya no pueden ingresar."
                            exitoReactivar="Familia reactivada."
                            alTerminar={familias.recargar}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small text-muted">{familias.datos.length} familia(s).</p>
        </>
      )}
    </>
  );
}
