import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, mensajeDe } from '../../api/cliente';
import type { GrupoDetalle, IdGuardado, UsuarioDeGrupo } from '../../api/tipos';
import { ErrorFormulario } from '../../componentes/Abm';
import { Cargando, ErrorCarga, NoEncontrado } from '../../componentes/Estados';
import { useMensajes } from '../../componentes/Mensajes';
import { useDatos } from '../../hooks/useDatos';
import { useTitulo } from '../../hooks/useTitulo';

/** Alta (/grupos/nuevo) y modificación (/grupos/:id) de un grupo con sus usuarios. */
export function GrupoFormulario() {
  const { id: parametroId } = useParams();
  const esNuevo = parametroId === undefined;
  const id = esNuevo ? 0 : Number(parametroId);
  const volver = (useLocation().state as { volver?: string } | null)?.volver ?? '/grupos';
  useTitulo(esNuevo ? 'Nuevo grupo' : 'Editar grupo');
  const { navegarConMensaje } = useMensajes();

  const grupo = useDatos(
    () => (esNuevo ? Promise.resolve(undefined) : api.get<GrupoDetalle>(`/grupos/${id}`)),
    [id],
  );
  const usuarios = useDatos(
    () => api.get<UsuarioDeGrupo[]>('/grupos/usuarios', esNuevo ? {} : { incluirGrupoId: String(id) }),
    [id],
  );

  const [nombre, setNombre] = useState('');
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());
  const [buscar, setBuscar] = useState('');
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!grupo.datos) return;
    setNombre(grupo.datos.nombre);
    setSeleccionados(new Set(grupo.datos.usuarioIds));
  }, [grupo.datos]);

  const alternar = (usuarioId: number, marcado: boolean) =>
    setSeleccionados((actual) => {
      const nuevo = new Set(actual);
      if (marcado) nuevo.add(usuarioId);
      else nuevo.delete(usuarioId);
      return nuevo;
    });

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!nombre.trim()) return setError('El nombre del grupo es obligatorio.');

    setEnviando(true);
    try {
      const datos = { nombre, usuarioIds: [...seleccionados] };
      if (esNuevo) await api.post<IdGuardado>('/grupos', datos);
      else await api.put<IdGuardado>(`/grupos/${id}`, datos);
      navegarConMensaje(volver, { tipo: 'exito', texto: `Grupo "${nombre.trim()}" ${esNuevo ? 'creado' : 'modificado'}.` });
    } catch (err) {
      setError(mensajeDe(err));
      setEnviando(false);
    }
  };

  if (grupo.noEncontrado) return <NoEncontrado />;
  if (grupo.error) return <ErrorCarga mensaje={grupo.error} />;
  if (usuarios.error) return <ErrorCarga mensaje={usuarios.error} />;
  if ((!esNuevo && !grupo.datos) || !usuarios.datos) return <Cargando />;

  const filtro = buscar.trim().toLowerCase();
  const visibles = usuarios.datos.filter(
    (u) => !filtro || u.nombre.toLowerCase().includes(filtro) || u.login.toLowerCase().includes(filtro),
  );

  return (
    <>
      <h1 className="h4 mb-3">
        {esNuevo ? 'Nuevo grupo' : 'Editar grupo'}{' '}
        {grupo.datos && !grupo.datos.activo && (
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
                maxLength={100}
                autoFocus
                autoComplete="off"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>

            <fieldset className="mb-4">
              <legend className="form-label fs-6 mb-1">Usuarios</legend>
              <div className="form-text mt-0 mb-2">
                Un usuario puede estar en varios grupos. Los grupos no dan permisos: sirven para filtrar los reportes.
                Seleccionados: <strong>{seleccionados.size}</strong>.
              </div>
              <input
                type="search"
                className="form-control form-control-sm mb-2"
                placeholder="Buscar usuario…"
                aria-label="Buscar usuario"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
              />
              <div className="list-group lista-seleccion">
                {visibles.length === 0 && (
                  <div className="list-group-item text-muted small">No hay usuarios que coincidan.</div>
                )}
                {visibles.map((u) => (
                  <label key={u.id} className="list-group-item d-flex gap-2 align-items-start" htmlFor={`usuario_${u.id}`}>
                    <input
                      id={`usuario_${u.id}`}
                      type="checkbox"
                      className="form-check-input flex-shrink-0 mt-1"
                      checked={seleccionados.has(u.id)}
                      onChange={(e) => alternar(u.id, e.target.checked)}
                    />
                    <span>
                      {u.nombre}
                      {!u.activo && <span className="badge text-bg-secondary fw-normal ms-1">dado de baja</span>}
                      <span className="d-block small text-muted font-monospace">{u.login}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

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
