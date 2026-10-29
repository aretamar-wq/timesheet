import { Link } from 'react-router-dom';
import { api, queryString } from '../api/cliente';
import type { OpcionesReporte, OpcionFiltro, ResultadoReporte } from '../api/tipos';
import { useFiltrosUrl } from '../componentes/Abm';
import { Cargando, ErrorCarga } from '../componentes/Estados';
import { useDatos } from '../hooks/useDatos';
import { useTitulo } from '../hooks/useTitulo';
import { aDiaMesAnio, aHorasMinutos } from '../utils/formato';

/**
 * Desplegable con casillas para elegir uno o varios elementos (usuarios, grupos). El valor son los ids separados
 * por coma (así entra en los filtros de la URL); vacío = todos. "unidad" y "unidades" arman el resumen del botón.
 */
function SelectorMultiple({ id, opciones, valor, alCambiar, unidad, unidades }: {
  id: string;
  opciones: OpcionFiltro[];
  valor: string;
  alCambiar: (valor: string) => void;
  unidad: string;
  unidades: string;
}) {
  const elegidos = valor ? valor.split(',') : [];
  const alternar = (id: string) =>
    alCambiar(
      opciones
        .map((o) => String(o.id))
        .filter((otro) => (otro === id ? !elegidos.includes(id) : elegidos.includes(otro)))
        .join(','),
    );

  const nombres = opciones.filter((o) => elegidos.includes(String(o.id))).map((o) => o.texto);
  const resumen =
    elegidos.length === 0 ? 'Todos' : elegidos.length === 1 ? (nombres[0] ?? `1 ${unidad}`) : `${elegidos.length} ${unidades}`;

  return (
    <div className="dropdown">
      <button
        type="button"
        id={id}
        className="form-select form-select-sm text-start text-truncate"
        data-bs-toggle="dropdown"
        data-bs-auto-close="outside"
        aria-expanded="false"
        title={nombres.join(', ')}
      >
        {resumen}
      </button>
      <div className="dropdown-menu selector-multiple small py-1">
        <label className="dropdown-item d-flex gap-2">
          <input type="checkbox" className="form-check-input" checked={elegidos.length === 0} onChange={() => alCambiar('')} />
          Todos
        </label>
        <div className="dropdown-divider my-1" />
        {opciones.map((o) => (
          <label key={o.id} className="dropdown-item d-flex gap-2">
            <input
              type="checkbox"
              className="form-check-input"
              checked={elegidos.includes(String(o.id))}
              onChange={() => alternar(String(o.id))}
            />
            {o.texto}
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * Reporte de horas: filtros en la URL (fechas, usuarios, grupos, proyecto, categoría, tarea/GLPI), resultado con total al pie
 * y exportación a Excel y TXT. Sin fechas en la URL, el backend usa el mes actual.
 */
export function Reportes() {
  useTitulo('Reportes');
  const filtros = useFiltrosUrl({ desde: '', hasta: '', usuarioIds: '', grupoIds: '', proyectoId: '', categoriaId: '', tarea: '' });
  const { aplicados, borrador, cambiar } = filtros;

  const opciones = useDatos(() => api.get<OpcionesReporte>('/reportes/opciones'), []);
  const reporte = useDatos(() => api.get<ResultadoReporte>('/reportes', aplicados), [filtros.claveAplicados]);
  const r = reporte.datos;

  // Fechas efectivas (las que usó el backend) cuando la URL no las trae.
  const desdeMostrado = borrador.desde || r?.filtro.desde || opciones.datos?.mesActual.desde || '';
  const hastaMostrado = borrador.hasta || r?.filtro.hasta || opciones.datos?.mesActual.hasta || '';

  const urlPeriodo = (periodo: { desde: string; hasta: string }) => `/reportes${queryString({ ...periodo })}`;
  // Exportación: los filtros aplicados (los que muestra la tabla). Son GET: el navegador descarga con la cookie.
  const urlExportar = (formato: 'excel' | 'txt') => `/api/reportes/${formato}${queryString(aplicados)}`;

  return (
    <>
      <h1 className="h4 mb-3">Reporte de horas</h1>

      <form
        className="mb-3"
        onSubmit={(e) => {
          e.preventDefault();
          filtros.aplicar({ ...borrador, desde: desdeMostrado, hasta: hastaMostrado });
        }}
      >
        <div className="filtros-abm mb-2">
          <div className="filtro-fecha">
            <label htmlFor="desde" className="form-label small mb-1">Desde</label>
            <input
              type="date"
              id="desde"
              className="form-control form-control-sm"
              required
              value={desdeMostrado}
              onChange={(e) => cambiar('desde', e.target.value)}
            />
          </div>
          <div className="filtro-fecha">
            <label htmlFor="hasta" className="form-label small mb-1">Hasta</label>
            <input
              type="date"
              id="hasta"
              className="form-control form-control-sm"
              required
              value={hastaMostrado}
              onChange={(e) => cambiar('hasta', e.target.value)}
            />
          </div>
          {opciones.datos && (
            <div className="filtro-periodo small">
              <Link to={urlPeriodo(opciones.datos.mesActual)}>mes actual</Link> ·{' '}
              <Link to={urlPeriodo(opciones.datos.mesAnterior)}>mes anterior</Link>
            </div>
          )}
        </div>
        <div className="filtros-abm mb-0">
          <div className="filtro-combo">
            <label htmlFor="usuarioIds" className="form-label small mb-1">Usuarios</label>
            <SelectorMultiple
              id="usuarioIds"
              opciones={opciones.datos?.usuarios ?? []}
              valor={borrador.usuarioIds}
              alCambiar={(valor) => cambiar('usuarioIds', valor)}
              unidad="usuario"
              unidades="usuarios"
            />
          </div>
          <div className="filtro-combo">
            <label htmlFor="grupoIds" className="form-label small mb-1">Grupos</label>
            <SelectorMultiple
              id="grupoIds"
              opciones={opciones.datos?.grupos ?? []}
              valor={borrador.grupoIds}
              alCambiar={(valor) => cambiar('grupoIds', valor)}
              unidad="grupo"
              unidades="grupos"
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
              {opciones.datos?.proyectos.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}
            </select>
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
              {opciones.datos?.categorias.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}
            </select>
          </div>
          <div className="filtro-estado">
            <label htmlFor="tarea" className="form-label small mb-1">Tarea / GLPI</label>
            <input
              type="search"
              id="tarea"
              className="form-control form-control-sm"
              placeholder="Nº o texto"
              title="Un número busca ese GLPI; un texto busca en la descripción de la tarea"
              value={borrador.tarea}
              onChange={(e) => cambiar('tarea', e.target.value)}
            />
          </div>
          <div className="filtro-acciones">
            <button type="submit" className="btn btn-primary btn-sm">Consultar</button>
          </div>
          <div className="filtro-periodo small">
            <a
              href="/reportes"
              onClick={(e) => {
                e.preventDefault();
                filtros.limpiar();
              }}
            >
              limpiar filtros
            </a>
          </div>
        </div>
      </form>

      {opciones.error && <ErrorCarga mensaje={opciones.error} />}
      {reporte.error && <div className="alert alert-danger py-2 small">{reporte.error}</div>}
      {reporte.cargando && !r && <Cargando />}

      {r && !reporte.error && (
        <>
          <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
            <span className="me-2">
              <strong>{r.cantidadRegistros}</strong> registro(s) · Total <strong>{aHorasMinutos(r.totalHoras)}</strong> h
            </span>
            <a className="btn btn-outline-secondary btn-sm" href={urlExportar('excel')}>Exportar Excel</a>
            <a className="btn btn-outline-secondary btn-sm" href={urlExportar('txt')}>Exportar TXT</a>
          </div>
          {r.truncado && (
            <div className="alert alert-warning py-2 small">
              Se muestran los primeros {opciones.datos?.maximoFilas ?? r.filas.length} registros. El total incluye todos;
              para ver el detalle completo, exporte a Excel o TXT.
            </div>
          )}

          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle bg-white w-auto tabla-abm">
              <thead className="table-light">
                <tr>
                  <th>Proyecto</th>
                  <th>Categoría</th>
                  <th>Tarea</th>
                  <th className="text-end">GLPI</th>
                  <th>Usuario</th>
                  <th>Fecha</th>
                  <th className="text-end">Duración</th>
                </tr>
              </thead>
              <tbody>
                {r.filas.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-muted py-4">
                      No hay horas cargadas que coincidan con el filtro.
                    </td>
                  </tr>
                )}
                {r.filas.map((f, i) => (
                  <tr key={i}>
                    <td>{f.proyecto}</td>
                    <td>{f.categoria}</td>
                    <td>{f.tarea}</td>
                    <td className="text-end font-monospace">{f.glpi}</td>
                    <td className="text-nowrap">{f.usuario}</td>
                    <td className="text-nowrap">{aDiaMesAnio(f.fecha)}</td>
                    <td className="text-end">{aHorasMinutos(f.duracion)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="table-light">
                <tr>
                  <th colSpan={6}>Total</th>
                  <th className="text-end">{aHorasMinutos(r.totalHoras)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </>
  );
}
