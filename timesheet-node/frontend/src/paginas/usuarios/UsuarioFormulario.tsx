import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, mensajeDe } from '../../api/cliente';
import { FamiliaId, type Familia, type IdGuardado, type ResultadoBusquedaAD, type Usuario } from '../../api/tipos';
import { ErrorFormulario } from '../../componentes/Abm';
import { Cargando, ErrorCarga, NoEncontrado } from '../../componentes/Estados';
import { useMensajes } from '../../componentes/Mensajes';
import { useDatos } from '../../hooks/useDatos';
import { useTitulo } from '../../hooks/useTitulo';
import { useSesionActual } from '../../sesion/SesionContext';

interface EstadoAD {
  texto: string;
  clase: string;
}

const AYUDA_AD: EstadoAD = { texto: '', clase: '' };

/**
 * Alta (/usuarios/nuevo) y modificación (/usuarios/:id) de un usuario. El usuario de red se verifica en Active
 * Directory al salir del campo, con Enter o con "Verificar en AD", y si existe completa el nombre.
 */
export function UsuarioFormulario() {
  const { id: parametroId } = useParams();
  const esNuevo = parametroId === undefined;
  const id = esNuevo ? 0 : Number(parametroId);
  const volver = (useLocation().state as { volver?: string } | null)?.volver ?? '/usuarios';
  useTitulo(esNuevo ? 'Nuevo usuario' : 'Editar usuario');
  const { navegarConMensaje } = useMensajes();
  const sesion = useSesionActual();
  const esPropio = !esNuevo && id === sesion.usuarioId;

  const usuario = useDatos(
    () => (esNuevo ? Promise.resolve(undefined) : api.get<Usuario>(`/usuarios/${id}`)),
    [id],
  );
  // Familias activas, más la que el usuario ya tenía aunque esté dada de baja.
  const familias = useDatos(
    () => api.get<Familia[]>('/usuarios/familias', { incluirId: usuario.datos?.familiaId }),
    [usuario.datos?.familiaId],
  );

  const [login, setLogin] = useState('');
  const [nombre, setNombre] = useState('');
  // En el alta se sugiere la familia Empleado.
  const [familia, setFamilia] = useState(esNuevo ? String(FamiliaId.Empleado) : '');
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);
  const [estadoAD, setEstadoAD] = useState<EstadoAD>(AYUDA_AD);
  const ultimoBuscado = useRef<string | null>(null);
  const ultimoAutocompletado = useRef<string | null>(null);

  useEffect(() => {
    if (!usuario.datos) return;
    setLogin(usuario.datos.login);
    setNombre(usuario.datos.nombre);
    setFamilia(String(usuario.datos.familiaId));
  }, [usuario.datos]);

  const buscarEnAD = async (forzar: boolean) => {
    const valor = login.trim();
    if (!valor || (!forzar && valor === ultimoBuscado.current)) return;
    ultimoBuscado.current = valor;
    setEstadoAD({ texto: 'Buscando en Active Directory…', clase: 'text-muted' });
    try {
      const r = await api.get<ResultadoBusquedaAD>('/usuarios/buscar-ad', { login: valor });
      if (!r.encontrado) {
        setEstadoAD({ texto: `"${valor}" no existe en Active Directory.`, clase: 'text-danger' });
        return;
      }
      setLogin(r.login);
      ultimoBuscado.current = r.login;
      // Completa el nombre salvo que el usuario ya haya escrito otro.
      if (!nombre.trim() || nombre === ultimoAutocompletado.current) {
        setNombre(r.nombre);
        ultimoAutocompletado.current = r.nombre;
      }
      setEstadoAD(
        r.habilitado
          ? { texto: `✓ Encontrado en Active Directory: ${r.nombre}`, clase: 'text-success' }
          : { texto: 'La cuenta existe pero está deshabilitada en Active Directory: no podrá ingresar.', clase: 'text-danger' },
      );
    } catch (err) {
      setEstadoAD({ texto: mensajeDe(err), clase: 'text-danger' });
      ultimoBuscado.current = null;
    }
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!login.trim()) return setError('El usuario de red es obligatorio.');
    if (!nombre.trim()) return setError('El nombre es obligatorio.');
    if (!familia) return setError('Seleccione una familia.');

    setEnviando(true);
    try {
      const datos = { login, nombre, familiaId: Number(familia) };
      if (esNuevo) await api.post<IdGuardado>('/usuarios', datos);
      else await api.put<IdGuardado>(`/usuarios/${id}`, datos);
      navegarConMensaje(volver, { tipo: 'exito', texto: `Usuario "${nombre.trim()}" ${esNuevo ? 'creado' : 'modificado'}.` });
    } catch (err) {
      setError(mensajeDe(err));
      setEnviando(false);
    }
  };

  if (usuario.noEncontrado) return <NoEncontrado />;
  if (usuario.error) return <ErrorCarga mensaje={usuario.error} />;
  if (!esNuevo && !usuario.datos) return <Cargando />;

  return (
    <>
      <h1 className="h4 mb-3">
        {esNuevo ? 'Nuevo usuario' : 'Editar usuario'}{' '}
        {usuario.datos && !usuario.datos.activo && (
          <span className="badge text-bg-secondary fw-normal fs-6 align-middle">Dado de baja</span>
        )}
      </h1>

      <div className="card shadow-sm formulario-abm">
        <div className="card-body">
          <form onSubmit={(e) => void guardar(e)} noValidate>
            <ErrorFormulario mensaje={error} />

            <div className="mb-3">
              <label htmlFor="login" className="form-label">Usuario de red</label>
              <div className="input-group">
                <input
                  id="login"
                  className="form-control font-monospace"
                  maxLength={100}
                  autoComplete="off"
                  autoFocus={!esPropio}
                  readOnly={esPropio}
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  onBlur={() => !esPropio && void buscarEnAD(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !esPropio) {
                      e.preventDefault();
                      void buscarEnAD(true);
                    }
                  }}
                />
                {!esPropio && (
                  <button type="button" className="btn btn-outline-secondary" onClick={() => void buscarEnAD(true)}>
                    Verificar en AD
                  </button>
                )}
              </div>
              {esPropio ? (
                <div className="form-text">No puede cambiar su propio usuario de red.</div>
              ) : (
                <div className={`form-text ${estadoAD.clase}`} role="status" aria-live="polite">
                  {estadoAD.texto || (
                    <>
                      Usuario de Windows, sin dominio (ej. <span className="font-monospace">jperez</span>). Se valida
                      contra Active Directory.
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="mb-3">
              <label htmlFor="nombre" className="form-label">Nombre</label>
              <input
                id="nombre"
                className="form-control"
                maxLength={150}
                autoComplete="off"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>

            <div className="mb-4">
              <label htmlFor="familiaId" className="form-label">Familia</label>
              <select id="familiaId" className="form-select" value={familia} onChange={(e) => setFamilia(e.target.value)}>
                <option value="">Seleccione una familia…</option>
                {familias.datos?.map((f) => (
                  <option key={f.id} value={f.id}>{f.nombre}{f.activo ? '' : ' (dada de baja)'}</option>
                ))}
              </select>
              <div className="form-text">La familia define qué pantallas puede usar (sus patentes).</div>
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
