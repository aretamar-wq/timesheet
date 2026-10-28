import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, mensajeDe } from '../../api/cliente';
import { CategoriaId, type Categoria, type IdGuardado, type Proyecto } from '../../api/tipos';
import { ErrorFormulario } from '../../componentes/Abm';
import { Cargando, ErrorCarga, NoEncontrado } from '../../componentes/Estados';
import { useMensajes } from '../../componentes/Mensajes';
import { useDatos } from '../../hooks/useDatos';
import { useTitulo } from '../../hooks/useTitulo';

/** Alta (/proyectos/nuevo) y modificación (/proyectos/:id) de un proyecto. */
export function ProyectoFormulario() {
  const { id: parametroId } = useParams();
  const esNuevo = parametroId === undefined;
  const id = esNuevo ? 0 : Number(parametroId);
  const volver = (useLocation().state as { volver?: string } | null)?.volver ?? '/proyectos';
  useTitulo(esNuevo ? 'Nuevo proyecto' : 'Editar proyecto');
  const { navegarConMensaje } = useMensajes();

  const proyecto = useDatos(
    () => (esNuevo ? Promise.resolve(undefined) : api.get<Proyecto>(`/proyectos/${id}`)),
    [id],
  );
  // Categorías activas, más la que el proyecto ya tenía aunque esté dada de baja.
  const categorias = useDatos(
    () => api.get<Categoria[]>('/proyectos/categorias', { incluirId: proyecto.datos?.categoriaId }),
    [proyecto.datos?.categoriaId],
  );

  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('');
  const [usaGlpi, setUsaGlpi] = useState(false);
  const [glpiTocado, setGlpiTocado] = useState(false);
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!proyecto.datos) return;
    setNombre(proyecto.datos.nombre);
    setCategoria(String(proyecto.datos.categoriaId));
    setUsaGlpi(proyecto.datos.usaGlpi);
  }, [proyecto.datos]);

  // Alta: al elegir "Mantenimiento y Soporte" se sugiere marcar "Se carga por ticket GLPI"
  // (solo mientras el usuario no haya tocado el checkbox).
  const elegirCategoria = (valor: string) => {
    setCategoria(valor);
    if (esNuevo && !glpiTocado) setUsaGlpi(valor === String(CategoriaId.MantenimientoYSoporte));
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!nombre.trim()) return setError('El nombre del proyecto es obligatorio.');
    if (!categoria) return setError('Seleccione una categoría.');

    setEnviando(true);
    try {
      const datos = { nombre, categoriaId: Number(categoria), usaGlpi };
      if (esNuevo) await api.post<IdGuardado>('/proyectos', datos);
      else await api.put<IdGuardado>(`/proyectos/${id}`, datos);
      navegarConMensaje(volver, { tipo: 'exito', texto: `Proyecto "${nombre.trim()}" ${esNuevo ? 'creado' : 'modificado'}.` });
    } catch (err) {
      setError(mensajeDe(err));
      setEnviando(false);
    }
  };

  if (proyecto.noEncontrado) return <NoEncontrado />;
  if (proyecto.error) return <ErrorCarga mensaje={proyecto.error} />;
  if (!esNuevo && !proyecto.datos) return <Cargando />;

  return (
    <>
      <h1 className="h4 mb-3">
        {esNuevo ? 'Nuevo proyecto' : 'Editar proyecto'}{' '}
        {proyecto.datos && !proyecto.datos.activo && (
          <span className="badge text-bg-secondary fw-normal fs-6 align-middle">Dado de baja</span>
        )}
      </h1>

      <div className="card shadow-sm formulario-abm">
        <div className="card-body">
          <form onSubmit={(e) => void guardar(e)} noValidate>
            <ErrorFormulario mensaje={error} />

            <div className="mb-3">
              <label htmlFor="nombre" className="form-label">Nombre</label>
              <input
                id="nombre"
                className="form-control"
                maxLength={150}
                autoFocus
                autoComplete="off"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>

            <div className="mb-3">
              <label htmlFor="categoriaId" className="form-label">Categoría</label>
              <select id="categoriaId" className="form-select" value={categoria} onChange={(e) => elegirCategoria(e.target.value)}>
                <option value="">Seleccione una categoría…</option>
                {categorias.datos?.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}{c.activo ? '' : ' (dada de baja)'}</option>
                ))}
              </select>
            </div>

            <div className="form-check mb-1">
              <input
                id="usaGlpi"
                type="checkbox"
                className="form-check-input"
                checked={usaGlpi}
                onChange={(e) => {
                  setGlpiTocado(true);
                  setUsaGlpi(e.target.checked);
                }}
              />
              <label htmlFor="usaGlpi" className="form-check-label">Se carga por ticket GLPI</label>
            </div>
            <div className="form-text mb-4">
              Marcado: el proyecto tiene tareas (cada una es un ticket GLPI) y las horas se cargan siempre contra una tarea.
              <br />
              Sin marcar: el proyecto no tiene tareas y las horas se cargan directo contra el proyecto.
            </div>

            <div className="d-flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={enviando}>Guardar</button>
              <Link className="btn btn-outline-secondary" to={volver}>Cancelar</Link>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
