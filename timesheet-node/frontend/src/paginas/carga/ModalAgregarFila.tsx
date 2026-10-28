import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { api, mensajeDe } from '../../api/cliente';
import type { OpcionTarea, ProyectoCarga, ResultadoAltaTarea } from '../../api/tipos';
import { normalizarTexto } from '../../utils/formato';
import { textoTarea } from './horas';

const INFO_TAREA = 'Este proyecto se carga por ticket GLPI: elija el ticket o cree uno nuevo.';

interface Props {
  proyectos: ProyectoCarga[];
  /** Caché proyectoId → tareas activas, compartida entre aperturas del modal. */
  cacheTareas: Map<number, OpcionTarea[]>;
  alAgregar: (proyecto: ProyectoCarga, tarea: OpcionTarea | null) => void;
  alCerrar: () => void;
}

interface MensajeModal {
  texto: string;
  tipo: 'danger' | 'warning' | 'success';
}

/**
 * Modal "Agregar fila": proyecto (solo activos, agrupados por categoría) y, si el proyecto se carga por ticket
 * GLPI, la tarea (obligatoria) con buscador y alta rápida de tarea nueva.
 */
export function ModalAgregarFila({ proyectos, cacheTareas, alAgregar, alCerrar }: Props) {
  const [proyectoId, setProyectoId] = useState('');
  const [tareas, setTareas] = useState<OpcionTarea[] | undefined>();
  const [cargandoTareas, setCargandoTareas] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [tareaId, setTareaId] = useState('');
  const [panelNueva, setPanelNueva] = useState(false);
  const [nuevoGlpi, setNuevoGlpi] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [creando, setCreando] = useState(false);
  const [mensaje, setMensaje] = useState<MensajeModal>();
  const selProyecto = useRef<HTMLSelectElement>(null);
  const selTarea = useRef<HTMLSelectElement>(null);
  const txtGlpi = useRef<HTMLInputElement>(null);
  const txtNombre = useRef<HTMLInputElement>(null);

  const proyecto = proyectos.find((p) => String(p.id) === proyectoId);
  const usaGlpi = !!proyecto?.usaGlpi;

  // Proyectos agrupados por categoría (vienen ordenados por categoría y nombre).
  const grupos = useMemo(() => {
    const mapa = new Map<string, ProyectoCarga[]>();
    for (const p of proyectos) {
      if (!mapa.has(p.categoria)) mapa.set(p.categoria, []);
      mapa.get(p.categoria)!.push(p);
    }
    return [...mapa.entries()];
  }, [proyectos]);

  useEffect(() => {
    selProyecto.current?.focus();
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  const q = normalizarTexto(busqueda.trim());
  const todas = tareas ?? [];
  const visibles = !q ? todas : todas.filter((t) => String(t.glpi).includes(q) || normalizarTexto(t.nombre).includes(q));
  const puedeConfirmar = !!proyecto && (!usaGlpi || !!tareaId);

  /** Muestra las tareas del proyecto (y opcionalmente selecciona una). Sin tareas, abre directo el alta. */
  const llenarTareas = (lista: OpcionTarea[], seleccionarId?: number) => {
    setTareas(lista);
    if (seleccionarId) setBusqueda('');   // que la tarea elegida quede visible
    setTareaId(seleccionarId ? String(seleccionarId) : '');
    if (!lista.length) abrirPanelNueva('');
  };

  const cargarTareas = async (id: number, seleccionarId?: number) => {
    const enCache = cacheTareas.get(id);
    if (enCache) {
      llenarTareas(enCache, seleccionarId);
      return;
    }
    setTareas(undefined);
    setCargandoTareas(true);
    try {
      const r = await api.get<{ tareas: OpcionTarea[] }>('/carga/tareas', { proyectoId: id });
      cacheTareas.set(id, r.tareas);
      llenarTareas(r.tareas, seleccionarId);
    } catch (e) {
      setMensaje({ texto: mensajeDe(e), tipo: 'danger' });
    } finally {
      setCargandoTareas(false);
    }
  };

  const elegirProyecto = (valor: string) => {
    setMensaje(undefined);
    cerrarPanelNueva();
    setProyectoId(valor);
    setTareas(undefined);
    setBusqueda('');
    setTareaId('');
    const p = proyectos.find((x) => String(x.id) === valor);
    if (p?.usaGlpi) void cargarTareas(p.id);
  };

  // Al buscar: si la tarea elegida dejó de coincidir se deselecciona; si queda una sola coincidencia, se elige.
  const buscar = (texto: string) => {
    setBusqueda(texto);
    const qn = normalizarTexto(texto.trim());
    const filtradas = !qn ? todas : todas.filter((t) => String(t.glpi).includes(qn) || normalizarTexto(t.nombre).includes(qn));
    if (filtradas.some((t) => String(t.id) === tareaId)) return;
    setTareaId(qn && filtradas.length === 1 ? String(filtradas[0].id) : '');
  };

  // Enter en el buscador: si quedó una tarea elegida, agrega la fila; si no, pasa al combo.
  const teclaBuscador = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (puedeConfirmar) confirmar();
    else selTarea.current?.focus();
  };

  function abrirPanelNueva(busquedaActual = busqueda) {
    setPanelNueva(true);
    // Si se buscó un Nº de GLPI, se propone para el alta.
    const b = busquedaActual.trim();
    setNuevoGlpi((g) => g || (/^\d+$/.test(b) ? b.slice(0, 9) : ''));
  }

  function cerrarPanelNueva() {
    setPanelNueva(false);
    setNuevoGlpi('');
    setNuevoNombre('');
  }

  // Al abrir el panel, foco en la descripción si ya hay GLPI propuesto; si no, en el GLPI.
  useEffect(() => {
    if (!panelNueva) return;
    if (txtGlpi.current?.value) txtNombre.current?.focus();
    else txtGlpi.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelNueva]);

  const crearTarea = async () => {
    if (!proyecto?.usaGlpi) return;
    if (!nuevoGlpi.trim()) {
      setMensaje({ texto: 'Ingrese el número de ticket GLPI.', tipo: 'danger' });
      txtGlpi.current?.focus();
      return;
    }
    if (!nuevoNombre.trim()) {
      setMensaje({ texto: 'Ingrese la descripción de la tarea.', tipo: 'danger' });
      txtNombre.current?.focus();
      return;
    }
    setCreando(true);
    try {
      const r = await api.post<ResultadoAltaTarea>('/carga/tareas', {
        proyectoId: proyecto.id,
        nombre: nuevoNombre.trim(),
        glpi: nuevoGlpi.trim(),
      });
      cacheTareas.delete(proyecto.id);   // recargar la lista con la tarea nueva
      await cargarTareas(proyecto.id, r.tarea.id);
      cerrarPanelNueva();
      setMensaje(
        r.yaExistia
          ? { texto: `Ya existía la tarea "${textoTarea(r.tarea.nombre, r.tarea.glpi)}": se seleccionó esa.`, tipo: 'warning' }
          : { texto: 'Tarea creada.', tipo: 'success' },
      );
    } catch (e) {
      setMensaje({ texto: mensajeDe(e), tipo: 'danger' });
    } finally {
      setCreando(false);
    }
  };

  const enterCrea = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void crearTarea();
    }
  };

  function confirmar() {
    if (!proyecto) return;
    const tarea = usaGlpi ? todas.find((t) => String(t.id) === tareaId) ?? null : null;
    if (usaGlpi && !tarea) return;
    alAgregar(proyecto, tarea);
  }

  const tituloTareas = cargandoTareas
    ? 'Cargando…'
    : !todas.length
      ? 'No hay tareas: cree una con "+ Nueva tarea"'
      : !visibles.length
        ? 'Ninguna tarea coincide con la búsqueda'
        : q
          ? `Seleccione una tarea… (${visibles.length} de ${todas.length})`
          : 'Seleccione una tarea…';

  const infoTarea = q && tareas && !visibles.length && /^\d+$/.test(q)
    ? `El GLPI ${q} no está cargado en este proyecto: puede crearlo con "+ Nueva tarea".`
    : INFO_TAREA;

  return (
    <>
      <div
        className="modal d-block"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modalFilaTitulo"
        onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}
        onKeyDown={(e) => e.key === 'Escape' && alCerrar()}
      >
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title h5" id="modalFilaTitulo">Agregar fila</h2>
              <button type="button" className="btn-close" aria-label="Cerrar" onClick={alCerrar} />
            </div>
            <div className="modal-body">
              {mensaje && <div className={`alert py-2 small alert-${mensaje.tipo}`}>{mensaje.texto}</div>}

              <div className="mb-3">
                <label htmlFor="selProyecto" className="form-label">Proyecto</label>
                <select
                  id="selProyecto"
                  ref={selProyecto}
                  className="form-select"
                  value={proyectoId}
                  onChange={(e) => elegirProyecto(e.target.value)}
                >
                  <option value="">Seleccione un proyecto…</option>
                  {grupos.map(([categoria, lista]) => (
                    <optgroup key={categoria} label={categoria}>
                      {lista.map((p) => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Solo para proyectos que se cargan por ticket GLPI: la tarea (ticket) es obligatoria. */}
              {usaGlpi && (
                <div>
                  <div className="mb-2">
                    <label htmlFor="selTarea" className="form-label">Tarea (ticket GLPI)</label>
                    <input
                      type="search"
                      className="form-control form-control-sm mb-1"
                      autoComplete="off"
                      placeholder="Buscar por Nº de GLPI o descripción"
                      aria-label="Buscar tarea por Nº de GLPI o descripción"
                      disabled={!todas.length}
                      value={busqueda}
                      onChange={(e) => buscar(e.target.value)}
                      onKeyDown={teclaBuscador}
                    />
                    <select
                      id="selTarea"
                      ref={selTarea}
                      className="form-select"
                      disabled={tareas === undefined}
                      value={tareaId}
                      onChange={(e) => setTareaId(e.target.value)}
                    >
                      <option value="">{tituloTareas}</option>
                      {visibles.map((t) => (
                        <option key={t.id} value={t.id}>{textoTarea(t.nombre, t.glpi)}</option>
                      ))}
                    </select>
                    <div className="form-text">{infoTarea}</div>
                  </div>
                  <button type="button" className="btn btn-link btn-sm px-0" onClick={() => abrirPanelNueva()}>
                    + Nueva tarea
                  </button>

                  {panelNueva && (
                    <div className="border rounded p-3 mt-2 bg-light">
                      <div className="mb-2">
                        <label htmlFor="txtTareaGlpi" className="form-label">Nº de ticket GLPI</label>
                        <input
                          type="text"
                          id="txtTareaGlpi"
                          ref={txtGlpi}
                          className="form-control"
                          inputMode="numeric"
                          maxLength={9}
                          autoComplete="off"
                          value={nuevoGlpi}
                          onChange={(e) => setNuevoGlpi(e.target.value.replace(/\D/g, ''))}
                          onKeyDown={enterCrea}
                        />
                      </div>
                      <div className="mb-2">
                        <label htmlFor="txtTareaNombre" className="form-label">Descripción</label>
                        <input
                          type="text"
                          id="txtTareaNombre"
                          ref={txtNombre}
                          className="form-control"
                          maxLength={200}
                          autoComplete="off"
                          value={nuevoNombre}
                          onChange={(e) => setNuevoNombre(e.target.value)}
                          onKeyDown={enterCrea}
                        />
                      </div>
                      <div className="d-flex gap-2">
                        <button type="button" className="btn btn-success btn-sm" disabled={creando} onClick={() => void crearTarea()}>
                          Crear tarea
                        </button>
                        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={cerrarPanelNueva}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={alCerrar}>Cancelar</button>
              <button type="button" className="btn btn-primary" disabled={!puedeConfirmar} onClick={confirmar}>
                Agregar
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show" />
    </>
  );
}
