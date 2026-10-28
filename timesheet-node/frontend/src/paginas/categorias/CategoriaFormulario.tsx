import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, mensajeDe } from '../../api/cliente';
import type { Categoria, IdGuardado } from '../../api/tipos';
import { ErrorFormulario } from '../../componentes/Abm';
import { Cargando, ErrorCarga, NoEncontrado } from '../../componentes/Estados';
import { useMensajes } from '../../componentes/Mensajes';
import { useDatos } from '../../hooks/useDatos';
import { useTitulo } from '../../hooks/useTitulo';

/** Alta (/categorias/nueva) y modificación (/categorias/:id) de una categoría. */
export function CategoriaFormulario() {
  const { id: parametroId } = useParams();
  const esNuevo = parametroId === undefined;
  const id = esNuevo ? 0 : Number(parametroId);
  const volver = (useLocation().state as { volver?: string } | null)?.volver ?? '/categorias';
  useTitulo(esNuevo ? 'Nueva categoría' : 'Editar categoría');
  const { navegarConMensaje } = useMensajes();

  const categoria = useDatos(
    () => (esNuevo ? Promise.resolve(undefined) : api.get<Categoria>(`/categorias/${id}`)),
    [id],
  );

  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (categoria.datos) setNombre(categoria.datos.nombre);
  }, [categoria.datos]);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!nombre.trim()) return setError('El nombre de la categoría es obligatorio.');

    setEnviando(true);
    try {
      if (esNuevo) await api.post<IdGuardado>('/categorias', { nombre });
      else await api.put<IdGuardado>(`/categorias/${id}`, { nombre });
      navegarConMensaje(volver, { tipo: 'exito', texto: `Categoría "${nombre.trim()}" ${esNuevo ? 'creada' : 'modificada'}.` });
    } catch (err) {
      setError(mensajeDe(err));
      setEnviando(false);
    }
  };

  if (categoria.noEncontrado) return <NoEncontrado />;
  if (categoria.error) return <ErrorCarga mensaje={categoria.error} />;
  if (!esNuevo && !categoria.datos) return <Cargando />;

  return (
    <>
      <h1 className="h4 mb-3">
        {esNuevo ? 'Nueva categoría' : 'Editar categoría'}{' '}
        {categoria.datos && !categoria.datos.activo && (
          <span className="badge text-bg-secondary fw-normal fs-6 align-middle">Dada de baja</span>
        )}
      </h1>

      <div className="card shadow-sm formulario-abm">
        <div className="card-body">
          <form onSubmit={(e) => void guardar(e)} noValidate>
            <ErrorFormulario mensaje={error} />

            <div className="mb-4">
              <label htmlFor="nombre" className="form-label">Nombre</label>
              <input
                id="nombre"
                className="form-control"
                maxLength={100}
                autoFocus
                autoComplete="off"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
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
