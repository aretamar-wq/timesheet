import { Link } from 'react-router-dom';
import { api } from '../../api/cliente';
import type { Feriado } from '../../api/tipos';
import { BadgeEstado, BarraFiltros, BotonCambiarEstado, FiltroEstadoSelect, useFiltrosUrl } from '../../componentes/Abm';
import { Cargando, ErrorCarga } from '../../componentes/Estados';
import { useDatos } from '../../hooks/useDatos';
import { useTitulo } from '../../hooks/useTitulo';
import { aDiaMesAnio } from '../../utils/formato';

const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function nombreDia(fecha: string): string {
  return NOMBRES_DIA[new Date(`${fecha}T00:00:00Z`).getUTCDay()];
}

/** ABM de Feriados: listado con filtros por año (por defecto el actual), descripción y estado. */
export function FeriadosListado() {
  useTitulo('Feriados');
  const anioActual = new Date().getFullYear();
  const filtros = useFiltrosUrl({ anio: String(anioActual), texto: '', estado: 'activos' });
  const { aplicados, borrador, cambiar } = filtros;

  // "todos" no filtra por año (el backend ignora lo que no sea un número).
  const feriados = useDatos(() => api.get<Feriado[]>('/feriados', aplicados), [filtros.claveAplicados]);
  const volver = { volver: filtros.urlListado };
  const anios = Array.from({ length: 5 }, (_, i) => String(anioActual + 1 - i));
  if (!anios.includes(borrador.anio) && borrador.anio !== 'todos') anios.push(borrador.anio);

  return (
    <>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <h1 className="h4 mb-0">Feriados</h1>
        <Link className="btn btn-primary btn-sm ms-2" to="/feriados/nuevo" state={volver}>Nuevo feriado</Link>
      </div>

      <BarraFiltros alFiltrar={() => filtros.aplicar()} alLimpiar={filtros.limpiar}>
        <div className="filtro-estado">
          <label htmlFor="anio" className="form-label small mb-1">Año</label>
          <select id="anio" className="form-select form-select-sm" value={borrador.anio} onChange={(e) => cambiar('anio', e.target.value)}>
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
            <option value="todos">Todos</option>
          </select>
        </div>
        <div className="filtro-texto">
          <label htmlFor="texto" className="form-label small mb-1">Descripción</label>
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

      {feriados.error && <ErrorCarga mensaje={feriados.error} />}
      {feriados.cargando && !feriados.datos && <Cargando />}
      {feriados.datos && (
        <>
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle bg-white w-auto tabla-abm">
              <thead className="table-light">
                <tr>
                  <th>Fecha</th>
                  <th>Día</th>
                  <th>Descripción</th>
                  <th className="text-center">Estado</th>
                  <th><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {feriados.datos.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-muted py-4">No hay feriados que coincidan con el filtro.</td>
                  </tr>
                )}
                {feriados.datos.map((f) => (
                  <tr key={f.id} className={f.activo ? '' : 'text-muted'}>
                    <td className="text-nowrap">{aDiaMesAnio(f.fecha)}</td>
                    <td>{nombreDia(f.fecha)}</td>
                    <td>{f.descripcion}</td>
                    <td className="text-center"><BadgeEstado activo={f.activo} /></td>
                    <td className="text-nowrap">
                      <Link className="btn btn-outline-secondary btn-sm me-1" to={`/feriados/${f.id}`} state={volver}>
                        Editar
                      </Link>
                      <BotonCambiarEstado
                        ruta={`/feriados/${f.id}`}
                        activo={f.activo}
                        confirmarBaja={`¿Dar de baja el feriado del ${aDiaMesAnio(f.fecha)} (${f.descripcion})? Ese día dejará de mostrarse como feriado en la carga de horas.`}
                        confirmarReactivar={`¿Reactivar el feriado del ${aDiaMesAnio(f.fecha)} (${f.descripcion})?`}
                        exitoBaja="Feriado dado de baja."
                        exitoReactivar="Feriado reactivado."
                        alTerminar={feriados.recargar}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small text-muted">{feriados.datos.length} feriado(s).</p>
        </>
      )}
    </>
  );
}
