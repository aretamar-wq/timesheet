import { Link } from 'react-router-dom';
import { api } from '../../api/cliente';
import { Patente, type CategoriaListado } from '../../api/tipos';
import { BadgeEstado, BarraFiltros, BotonCambiarEstado, FiltroEstadoSelect, useFiltrosUrl } from '../../componentes/Abm';
import { Cargando, ErrorCarga } from '../../componentes/Estados';
import { useDatos } from '../../hooks/useDatos';
import { useTitulo } from '../../hooks/useTitulo';
import { useSesion } from '../../sesion/SesionContext';

/** ABM de Categorías: listado con filtros por nombre y estado. */
export function CategoriasListado() {
  useTitulo('Categorías');
  const { tienePatente } = useSesion();
  const verProyectos = tienePatente(Patente.ABM_PROYECTOS);
  const filtros = useFiltrosUrl({ texto: '', estado: 'activos' });
  const { aplicados, borrador, cambiar } = filtros;

  const categorias = useDatos(() => api.get<CategoriaListado[]>('/categorias', aplicados), [filtros.claveAplicados]);
  const volver = { volver: filtros.urlListado };

  return (
    <>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <h1 className="h4 mb-0">Categorías</h1>
        <Link className="btn btn-primary btn-sm ms-2" to="/categorias/nueva" state={volver}>Nueva categoría</Link>
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

      {categorias.error && <ErrorCarga mensaje={categorias.error} />}
      {categorias.cargando && !categorias.datos && <Cargando />}
      {categorias.datos && (
        <>
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle bg-white w-auto tabla-abm">
              <thead className="table-light">
                <tr>
                  <th>Nombre</th>
                  <th className="text-center">Proyectos activos</th>
                  <th className="text-center">Estado</th>
                  <th><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {categorias.datos.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-muted py-4">No hay categorías que coincidan con el filtro.</td>
                  </tr>
                )}
                {categorias.datos.map((c) => (
                  <tr key={c.id} className={c.activo ? '' : 'text-muted'}>
                    <td>{c.nombre}</td>
                    <td className="text-center">
                      {verProyectos && c.proyectosActivos > 0 ? (
                        <Link to={`/proyectos?categoriaId=${c.id}`} title="Ver proyectos de la categoría">{c.proyectosActivos}</Link>
                      ) : (
                        c.proyectosActivos
                      )}
                    </td>
                    <td className="text-center"><BadgeEstado activo={c.activo} femenino /></td>
                    <td className="text-nowrap">
                      <Link className="btn btn-outline-secondary btn-sm me-1" to={`/categorias/${c.id}`} state={volver}>
                        Editar
                      </Link>
                      <BotonCambiarEstado
                        ruta={`/categorias/${c.id}`}
                        activo={c.activo}
                        confirmarBaja={
                          `¿Dar de baja la categoría "${c.nombre}"?` +
                          (c.proyectosActivos > 0
                            ? ` La usan ${c.proyectosActivos} proyecto(s) activo(s), que la conservan; no se podrá elegir para proyectos nuevos.`
                            : '')
                        }
                        confirmarReactivar={`¿Reactivar la categoría "${c.nombre}"?`}
                        exitoBaja="Categoría dada de baja. Los proyectos que la usan la conservan."
                        exitoReactivar="Categoría reactivada."
                        alTerminar={categorias.recargar}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small text-muted">{categorias.datos.length} categoría(s).</p>
        </>
      )}
    </>
  );
}
