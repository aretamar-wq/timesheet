import { useState, type FormEvent } from 'react';
import { mensajeDe } from '../api/cliente';
import { useTitulo } from '../hooks/useTitulo';
import { useSesion } from '../sesion/SesionContext';

/** Login con usuario y contraseña de red (se validan contra Active Directory en el backend). */
export function Login() {
  useTitulo('Ingresar');
  const { appNombre, ingresar } = useSesion();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (!usuario.trim() || !password) {
      setError('Ingrese usuario y contraseña.');
      return;
    }
    setEnviando(true);
    try {
      // Al haber sesión, App redirige a la página pedida (?volver=) o a la carga de horas.
      await ingresar(usuario, password);
    } catch (err) {
      setError(mensajeDe(err));
      setPassword('');
      setEnviando(false);
    }
  };

  // Ancho fijo (no porcentaje de la pantalla): en monitores anchos la tarjeta no se estira.
  return (
    <main className="container-fluid px-4">
      <div className="tarjeta-login">
        <div className="card shadow-sm">
          <div className="card-body p-4">
            <h1 className="h4 mb-1 d-flex align-items-center justify-content-center gap-2 titulo-marca">
              <img src="/favicon.png" alt="" className="logo-app" width={36} height={36} />
              {appNombre}
            </h1>
            <p className="text-muted text-center small mb-4">Ingrese con su usuario y contraseña de red.</p>

            <form onSubmit={(e) => void enviar(e)} noValidate>
              {error && <div className="alert alert-danger py-2 small">{error}</div>}

              <div className="mb-3">
                <label htmlFor="usuario" className="form-label">Usuario</label>
                <input
                  id="usuario"
                  className="form-control"
                  autoFocus
                  autoComplete="username"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                />
              </div>

              <div className="mb-4">
                <label htmlFor="password" className="form-label">Contraseña</label>
                <input
                  id="password"
                  type="password"
                  className="form-control"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-primary w-100" disabled={enviando}>
                {enviando ? 'Ingresando…' : 'Ingresar'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
