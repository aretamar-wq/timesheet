import { Link } from 'react-router-dom';
import { api } from '../../api/cliente';
import { Patente, type PatenteListado } from '../../api/tipos';
import { BarraFiltros, useFiltrosUrl } from '../../componentes/Abm';
import { Cargando, ErrorCarga } from '../../componentes/Estados';
import { useDatos } from '../../hooks/useDatos';
import { useTitulo } from '../../hooks/useTitulo';
import { useSesion } from '../../sesion/SesionContext';

/**
 * Patentes: solo consulta y descripción. Las patentes las crea un desarrollador por script junto con el código que
 * las usa; para dar o quitar permisos se marcan o desmarcan en la familia.
 */
export function PatentesListado() {
  useTitulo('Patentes');
  const { tienePatente } = useSesion();
  const filtros = useFiltrosUrl({ texto: '' });
  const { aplicados, borrador, cambiar } = filtros;

  const patentes = useDatos(() => api.get<PatenteListado[]>('/patentes', aplicados), [filtros.claveAplicados]);
  const volver = { volver: filtros.urlListado };

  return (
    <>
      <div className="mb-3">
        <h1 className="h4 mb-1">Patentes</h1>
        <p className="small text-muted mb-0">
          Cada patente habilita una pantalla del sistema. Para dar o quitar permisos, marque o desmarque las patentes en
          la familia correspondiente.{' '}
          {tienePatente(Patente.ABM_FAMILIAS) && <Link to="/familias">Ir al ABM de Familias</Link>}
        </p>
      </div>

      <BarraFiltros alFiltrar={() => filtros.aplicar()} alLimpiar={filtros.limpiar}>
        <div className="filtro-texto">
          <label htmlFor="texto" className="form-label small mb-1">Nombre o descripción</label>
          <input
            type="search"
            id="texto"
            className="form-control form-control-sm"
            placeholder="Buscar…"
            value={borrador.texto}
            onChange={(e) => cambiar('texto', e.target.value)}
          />
        </div>
      </BarraFiltros>

      {patentes.error && <ErrorCarga mensaje={patentes.error} />}
      {patentes.cargando && !patentes.datos && <Cargando />}
      {patentes.datos && (
        <>
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle bg-white w-auto tabla-abm">
              <thead className="table-light">
                <tr>
                  <th>Nombre</th>
                  <th>Descripción</th>
                  <th className="text-center">Familias activas</th>
                  <th><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {patentes.datos.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-muted py-4">No hay patentes que coincidan con el filtro.</td>
                  </tr>
                )}
                {patentes.datos.map((p) => (
                  <tr key={p.id}>
                    <td className="text-nowrap">
                      <span className="font-monospace">{p.nombre}</span>
                      {!p.activo && (
                        <span className="badge text-bg-secondary fw-normal ms-1" title="Deshabilitada en la base de datos">
                          dada de baja
                        </span>
                      )}
                    </td>
                    <td>{p.descripcion}</td>
                    <td className="text-center">{p.familiasActivas}</td>
                    <td className="text-nowrap">
                      <Link className="btn btn-outline-secondary btn-sm" to={`/patentes/${p.id}`} state={volver}>
                        Editar descripción
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small text-muted">{patentes.datos.length} patente(s).</p>
        </>
      )}
    </>
  );
}
