import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { useBlocker, useSearchParams } from 'react-router-dom';
import { api, mensajeDe } from '../api/cliente';
import type { DiaSemana, FilaCarga, OpcionTarea, ProyectoCarga, SemanaCarga } from '../api/tipos';
import { Cargando, ErrorCarga } from '../componentes/Estados';
import { useDatos } from '../hooks/useDatos';
import { useTitulo } from '../hooks/useTitulo';
import { aDiaMesAnio, encabezadoDia, sumarDias } from '../utils/formato';
import {
  aplicarMascara,
  horasATexto,
  interpretar,
  MAX_MIN,
  minutosATexto,
  minutosSeguros,
  soloDigitos,
  textoTarea,
} from './carga/horas';
import { ModalAgregarFila } from './carga/ModalAgregarFila';

/**
 * Grilla semanal de carga de horas.
 * - Máscara: el usuario escribe solo números; los dos puntos se insertan solos (130 → 1:30, 8 → 8:00).
 * - Autoguardado: cada celda se guarda al salir de ella. Los guardados se encolan y se envían de a uno,
 *   así dos cambios rápidos de la misma celda nunca llegan al servidor en desorden.
 * - Las filas sin horas no se persisten: si no se carga nada, desaparecen al recargar.
 */

interface Celda {
  /** Texto que se ve en la celda. */
  valor: string;
  /** Último texto guardado en el servidor. */
  guardado: string;
  guardando: boolean;
  /** Mensaje si el último guardado (o la validación) falló. */
  error: string | null;
  /** Para la animación de "guardado". */
  destello: boolean;
}

interface Fila {
  clave: string;
  proyectoId: number;
  proyecto: string;
  tareaId: number | null;
  tarea: string | null;
  glpi: number | null;
  editable: boolean;
  motivoNoEditable: string | null;
  celdas: Celda[];
}

type DatosFila = Pick<FilaCarga, 'proyectoId' | 'proyecto' | 'tareaId' | 'tarea' | 'glpi' | 'editable' | 'motivoNoEditable'> & {
  horas?: (number | null)[];
};

function claveFila(proyectoId: number, tareaId: number | null): string {
  return `${proyectoId}|${tareaId ?? ''}`;
}

function crearFila(f: DatosFila): Fila {
  return {
    clave: claveFila(f.proyectoId, f.tareaId),
    proyectoId: f.proyectoId,
    proyecto: f.proyecto,
    tareaId: f.tareaId,
    tarea: f.tarea,
    glpi: f.glpi,
    editable: f.editable,
    motivoNoEditable: f.motivoNoEditable,
    celdas: Array.from({ length: 7 }, (_, i) => {
      const texto = horasATexto(f.horas?.[i]);
      return { valor: texto, guardado: texto, guardando: false, error: null, destello: false };
    }),
  };
}

function filaSinHoras(f: Fila): boolean {
  return f.celdas.every((c) => !c.valor && !c.guardado && !c.guardando);
}

/** Sábado, domingo o feriado: la columna se muestra con otro fondo (la carga sigue permitida). */
function noLaborable(d: DiaSemana): boolean {
  return d.finDeSemana || d.feriado !== null;
}

function tieneErrores(filas: Fila[]): boolean {
  return filas.some((f) => f.celdas.some((c) => c.error));
}

export function CargaHoras() {
  useTitulo('Carga de horas');
  const [params, setParams] = useSearchParams();
  const fecha = params.get('fecha') ?? '';
  const semana = useDatos(() => api.get<SemanaCarga>('/carga/semana', { fecha }), [fecha]);

  const [filas, setFilas] = useState<Fila[]>([]);
  const [pendientes, setPendientes] = useState(0);
  const [huboGuardado, setHuboGuardado] = useState(false);
  const [ultimoError, setUltimoError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; clase: string } | null>(null);
  const [copiando, setCopiando] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [enfocarClave, setEnfocarClave] = useState<string | null>(null);

  const cola = useRef<Promise<void>>(Promise.resolve());   // guardados pendientes, en orden
  const pendientesRef = useRef(0);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const cacheTareas = useRef(new Map<number, OpcionTarea[]>());   // proyectoId → tareas activas
  const filasRef = useRef(filas);
  filasRef.current = filas;

  // Datos nuevos (cambio de semana): se arma la grilla de cero.
  useEffect(() => {
    if (!semana.datos) return;
    setFilas(semana.datos.filas.map(crearFila));
    setHuboGuardado(false);
    setUltimoError(null);
    setAviso(null);
  }, [semana.datos]);

  // Aviso al cerrar/recargar con guardados en curso o celdas con error.
  useEffect(() => {
    const alSalir = (e: BeforeUnloadEvent) => {
      if (pendientesRef.current > 0 || tieneErrores(filasRef.current)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', alSalir);
    return () => window.removeEventListener('beforeunload', alSalir);
  }, []);

  // Al ir a otra sección de la aplicación: se esperan los guardados en curso y, si quedaron celdas con error,
  // se pide confirmación (equivale al aviso de beforeunload para la navegación interna).
  const bloqueo = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname &&
      (pendientesRef.current > 0 || tieneErrores(filasRef.current)),
  );
  useEffect(() => {
    if (bloqueo.state !== 'blocked') return;
    void (async () => {
      await cola.current;
      await new Promise((r) => window.setTimeout(r, 0));   // que se apliquen los últimos estados
      if (!tieneErrores(filasRef.current) ||
          window.confirm('Hay celdas con error que no se guardaron. ¿Salir igual?')) {
        bloqueo.proceed();
      } else {
        bloqueo.reset();
      }
    })();
  }, [bloqueo]);

  // Después de agregar una fila, foco en su primera celda.
  useEffect(() => {
    if (!enfocarClave) return;
    inputs.current.get(`${enfocarClave}|0`)?.focus();
    setEnfocarClave(null);
  }, [enfocarClave]);

  const actualizarCelda = useCallback((clave: string, dia: number, cambio: (c: Celda) => Celda) => {
    setFilas((actuales) =>
      actuales.map((f) => (f.clave !== clave ? f : { ...f, celdas: f.celdas.map((c, i) => (i === dia ? cambio(c) : c)) })),
    );
  }, []);

  if (semana.error) return <ErrorCarga mensaje={semana.error} />;
  if (!semana.datos) return <Cargando />;
  const datos = semana.datos;
  const { lunes, dias } = datos;

  const cambiarPendientes = (delta: number) => {
    pendientesRef.current += delta;
    setPendientes(pendientesRef.current);
  };

  // ------------------------------------------------------------------ guardado

  /** Al salir de una celda: normaliza, valida y, si cambió, encola el guardado. */
  const alSalirDeCelda = (fila: Fila, dia: number, valorActual: string) => {
    let minutos: number;
    try {
      minutos = interpretar(valorActual);
    } catch (e) {
      const mensaje = mensajeDe(e);
      actualizarCelda(fila.clave, dia, (c) => ({ ...c, error: mensaje }));
      setUltimoError(mensaje);
      return;
    }
    const texto = minutosATexto(minutos);
    if (texto === fila.celdas[dia].guardado) {
      actualizarCelda(fila.clave, dia, (c) => ({ ...c, valor: texto, error: null }));
      return;
    }

    actualizarCelda(fila.clave, dia, (c) => ({ ...c, valor: texto, guardando: true }));
    cambiarPendientes(1);
    setAviso(null);

    cola.current = cola.current.then(async () => {
      try {
        await api.put('/carga/celda', {
          fecha: dias[dia].fecha,
          proyectoId: fila.proyectoId,
          tareaId: fila.tareaId,
          duracion: texto,
        });
        setHuboGuardado(true);
        // Si el usuario ya volvió a cambiar la celda, no pisar su error/valor nuevo.
        actualizarCelda(fila.clave, dia, (c) =>
          c.valor === texto ? { ...c, guardado: texto, error: null, destello: true } : { ...c, guardado: texto },
        );
        window.setTimeout(() => actualizarCelda(fila.clave, dia, (c) => ({ ...c, destello: false })), 1200);
      } catch (e) {
        const mensaje = mensajeDe(e);
        actualizarCelda(fila.clave, dia, (c) => ({ ...c, error: mensaje }));
        setUltimoError(mensaje);
      } finally {
        actualizarCelda(fila.clave, dia, (c) => ({ ...c, guardando: false }));
        cambiarPendientes(-1);
      }
    });
  };

  // ------------------------------------------------------------------ eventos de la grilla

  const cambiarValor = (fila: Fila, dia: number, e: ChangeEvent<HTMLInputElement>) => {
    const valor = aplicarMascara(soloDigitos(e.target.value));   // también limpia lo pegado
    actualizarCelda(fila.clave, dia, (c) => ({ ...c, valor }));
  };

  const moverVertical = (indiceFila: number, dia: number, direccion: number, input: HTMLInputElement) => {
    let i = indiceFila + direccion;
    while (i >= 0 && i < filas.length && !filas[i].editable) i += direccion;
    const destino = i >= 0 && i < filas.length ? inputs.current.get(`${filas[i].clave}|${dia}`) : undefined;
    if (destino) destino.focus();
    else input.blur();   // última fila: igual dispara el guardado
  };

  const tecla = (indiceFila: number, dia: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      moverVertical(indiceFila, dia, e.key === 'ArrowUp' ? -1 : 1, e.currentTarget);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length === 1 && !/[0-9]/.test(e.key)) e.preventDefault();   // solo números
  };

  const quitarFila = (clave: string) => {
    setFilas((actuales) => actuales.filter((f) => f.clave !== clave || !filaSinHoras(f)));
  };

  // ------------------------------------------------------------------ navegación de semanas

  /** Espera a que terminen los guardados (y confirma si hay errores) antes de cambiar de semana. */
  const irASemana = async (nuevaFecha: string | null) => {
    const activo = document.activeElement;
    if (activo instanceof HTMLInputElement && activo.classList.contains('celda-horas')) activo.blur();
    await cola.current;
    await new Promise((r) => window.setTimeout(r, 0));   // que se apliquen los últimos estados
    if (tieneErrores(filasRef.current) &&
        !window.confirm('Hay celdas con error que no se guardaron. ¿Cambiar de semana igual?')) {
      return;
    }
    setParams(nuevaFecha ? { fecha: nuevaFecha } : {});
  };

  // ------------------------------------------------------------------ copiar semana anterior / agregar fila

  const copiarSemanaAnterior = async () => {
    setCopiando(true);
    try {
      const r = await api.get<{ filas: FilaCarga[] }>('/carga/semana-anterior', { fecha: lunes });
      const existentes = new Set(filasRef.current.map((f) => f.clave));
      const nuevas = r.filas.filter((f) => !existentes.has(claveFila(f.proyectoId, f.tareaId)));
      setFilas((actuales) => [...actuales, ...nuevas.map((f) => crearFila({ ...f, horas: undefined }))]);
      setAviso({
        clase: 'text-muted',
        texto: r.filas.length === 0
          ? 'La semana anterior no tiene horas cargadas.'
          : nuevas.length === 0
            ? 'Las filas de la semana anterior ya están en la grilla.'
            : `Se agregaron ${nuevas.length} ${nuevas.length === 1 ? 'fila.' : 'filas.'}`,
      });
    } catch (e) {
      setAviso({ clase: 'text-danger', texto: mensajeDe(e) });
    } finally {
      setCopiando(false);
    }
  };

  const agregarFila = (proyecto: ProyectoCarga, tarea: OpcionTarea | null) => {
    const clave = claveFila(proyecto.id, tarea?.id ?? null);
    if (!filas.some((f) => f.clave === clave)) {
      setFilas((actuales) => [
        ...actuales,
        crearFila({
          proyectoId: proyecto.id,
          proyecto: proyecto.nombre,
          tareaId: tarea?.id ?? null,
          tarea: tarea?.nombre ?? null,
          glpi: tarea?.glpi ?? null,
          editable: true,
          motivoNoEditable: null,
        }),
      ]);
    }
    setModalAbierto(false);
    setEnfocarClave(clave);
  };

  // ------------------------------------------------------------------ totales y estado

  const totalesDia = Array<number>(7).fill(0);
  const totalesFila = filas.map((f) =>
    f.celdas.reduce((suma, c, i) => {
      const m = minutosSeguros(c.valor);
      totalesDia[i] += m;
      return suma + m;
    }, 0),
  );
  const totalSemana = totalesFila.reduce((a, b) => a + b, 0);
  const cantidadErrores = filas.reduce((n, f) => n + f.celdas.filter((c) => c.error).length, 0);

  let estado: { texto: string; clase: string } | null = null;
  if (pendientes > 0) estado = { texto: 'Guardando…', clase: 'text-muted' };
  else if (cantidadErrores > 0) {
    estado = {
      texto: `${ultimoError ?? 'Hay celdas con error'}${cantidadErrores > 1 ? ` (${cantidadErrores} celdas con error)` : ''}`,
      clase: 'text-danger',
    };
  } else if (aviso) estado = aviso;
  else if (huboGuardado) estado = { texto: 'Cambios guardados', clase: 'text-success' };

  // ------------------------------------------------------------------ render

  return (
    <>
      {/* El contenedor mide lo mismo que la grilla: así los botones de la barra quedan alineados con su borde derecho. */}
      <div className="contenido-ajustado">
        <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
          <h1 className="h4 mb-0 me-2">Carga de horas</h1>
          <div className="btn-group btn-group-sm" role="group" aria-label="Navegación de semanas">
            <button type="button" className="btn btn-outline-secondary" title="Semana anterior"
              onClick={() => void irASemana(sumarDias(lunes, -7))}>
              &laquo;
            </button>
            <button type="button" className="btn btn-outline-secondary" onClick={() => void irASemana(null)}>Hoy</button>
            <button type="button" className="btn btn-outline-secondary" title="Semana siguiente"
              onClick={() => void irASemana(sumarDias(lunes, 7))}>
              &raquo;
            </button>
          </div>
          <span className="fw-semibold">
            Semana del {aDiaMesAnio(lunes).slice(0, 5)} al {aDiaMesAnio(sumarDias(lunes, 6))}
          </span>

          <div className="ms-auto d-flex flex-wrap align-items-center gap-2">
            <span className={`small ${estado?.clase ?? ''}`} role="status" aria-live="polite">{estado?.texto}</span>
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled={copiando}
              onClick={() => void copiarSemanaAnterior()}>
              Copiar semana anterior
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setModalAbierto(true)}>
              Agregar fila
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table className="table table-sm table-bordered align-middle bg-white grilla-horas">
            <thead className="table-light">
              <tr>
                <th className="col-fila">Proyecto / Tarea</th>
                {dias.map((d) => {
                  const enc = encabezadoDia(d.fecha);
                  const clases = `text-center col-dia${noLaborable(d) ? ' no-laborable' : ''}${d.fecha === datos.hoy ? ' hoy' : ''}`;
                  return (
                    <th key={d.fecha} className={clases} title={d.feriado ? `Feriado: ${d.feriado}` : undefined}>
                      {enc.dia}
                      <br />
                      <span className="small text-muted fw-normal">{enc.fecha}</span>
                    </th>
                  );
                })}
                <th className="text-center col-total">Total</th>
                <th className="col-acciones"><span className="visually-hidden">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && (
                <tr>
                  <td colSpan={dias.length + 3} className="text-center text-muted py-4">
                    No hay horas cargadas esta semana. Use "Agregar fila" o "Copiar semana anterior".
                  </td>
                </tr>
              )}
              {filas.map((f, indiceFila) => {
                const tarea = textoTarea(f.tarea, f.glpi);
                return (
                  <tr key={f.clave} className={f.editable ? '' : 'fila-baja'}>
                    {/* Con tarea: la tarea (y su GLPI) distingue la fila, va primero y en negrita; el proyecto
                        queda debajo en gris. Sin tarea: solo el proyecto, en negrita. */}
                    <th scope="row" className="col-fila fw-normal">
                      <div className="fw-semibold">
                        {f.tarea ?? f.proyecto}
                        {f.tarea && f.glpi && (
                          <span className="badge rounded-pill text-bg-light border fw-normal ms-2">GLPI {f.glpi}</span>
                        )}
                        {!f.editable && (
                          <span className="badge text-bg-secondary fw-normal ms-2">{f.motivoNoEditable ?? 'Solo lectura'}</span>
                        )}
                      </div>
                      {f.tarea && <div className="small text-muted">{f.proyecto}</div>}
                    </th>
                    {f.celdas.map((c, dia) => {
                      const clases = ['celda-horas'];
                      if (c.guardando) clases.push('guardando');
                      if (c.destello) clases.push('guardado');
                      if (c.error) clases.push('con-error');
                      return (
                        <td key={dia} className={`p-0${noLaborable(dias[dia]) ? ' no-laborable' : ''}`}>
                          <input
                            ref={(el) => {
                              const clave = `${f.clave}|${dia}`;
                              if (el) inputs.current.set(clave, el);
                              else inputs.current.delete(clave);
                            }}
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={5}
                            className={clases.join(' ')}
                            value={c.valor}
                            title={c.error ?? ''}
                            disabled={!f.editable}
                            aria-label={`${f.proyecto}${tarea ? ` - ${tarea}` : ''} ${dias[dia].fecha}`}
                            onChange={(e) => cambiarValor(f, dia, e)}
                            onKeyDown={(e) => tecla(indiceFila, dia, e)}
                            onFocus={(e) => e.currentTarget.select()}
                            onBlur={(e) => f.editable && alSalirDeCelda(f, dia, e.currentTarget.value)}
                          />
                        </td>
                      );
                    })}
                    <td className="text-center fw-semibold col-total">{minutosATexto(totalesFila[indiceFila]) || '0:00'}</td>
                    <td className="text-center col-acciones">
                      {filaSinHoras(f) && (
                        <button type="button" className="btn btn-link btn-sm text-danger p-0"
                          title="Quitar fila (solo si no tiene horas)" aria-label="Quitar fila"
                          onClick={() => quitarFila(f.clave)}>
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="table-light">
              <tr>
                <th>Total</th>
                {totalesDia.map((minutos, i) => {
                  const excedido = minutos > MAX_MIN;
                  return (
                    <th key={i}
                      className={`text-center total-dia${noLaborable(dias[i]) ? ' no-laborable' : ''}${excedido ? ' excedido' : ''}`}
                      title={excedido ? 'El total del día supera las 24 horas' : ''}>
                      {minutosATexto(minutos) || '0:00'}
                    </th>
                  );
                })}
                <th className="text-center">{minutosATexto(totalSemana) || '0:00'}</th>
                <th />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <p className="small text-muted">
        Escriba solo números: los dos puntos se agregan solos (<kbd>130</kbd> = 1:30, <kbd>8</kbd> = 8:00). Módulos de 30
        minutos. Cada celda se guarda al salir de ella. <kbd>Enter</kbd> / <kbd>↑</kbd> <kbd>↓</kbd> para moverse entre filas.
      </p>

      {modalAbierto && (
        <ModalAgregarFila
          proyectos={datos.proyectos}
          cacheTareas={cacheTareas.current}
          alAgregar={agregarFila}
          alCerrar={() => setModalAbierto(false)}
        />
      )}
    </>
  );
}
