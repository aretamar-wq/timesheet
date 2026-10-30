import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Patente, type PatenteCodigo } from '../api/tipos';
import { useSesion, useSesionActual } from '../sesion/SesionContext';
import { VisorMensajes } from './Mensajes';

/** Menú de administración: cada ABM se muestra solo si el usuario tiene su patente. */
const ABMS: { patente: PatenteCodigo; ruta: string; texto: string }[] = [
  { patente: Patente.ABM_PROYECTOS, ruta: '/proyectos', texto: 'Proyectos' },
  { patente: Patente.ABM_TAREAS, ruta: '/tareas', texto: 'Tareas' },
  { patente: Patente.ABM_CATEGORIAS, ruta: '/categorias', texto: 'Categorías' },
  { patente: Patente.ABM_FERIADOS, ruta: '/feriados', texto: 'Feriados' },
  { patente: Patente.ABM_USUARIOS, ruta: '/usuarios', texto: 'Usuarios' },
  { patente: Patente.ABM_FAMILIAS, ruta: '/familias', texto: 'Familias' },
  { patente: Patente.ABM_PATENTES, ruta: '/patentes', texto: 'Patentes' },
];

const claseLink = ({ isActive }: { isActive: boolean }) => `nav-link${isActive ? ' active' : ''}`;

/** Barra superior + mensajes + página actual (solo para usuarios logueados). */
export function Layout() {
  const { appNombre, tienePatente, salir } = useSesion();
  const sesion = useSesionActual();
  const { pathname } = useLocation();

  const abms = ABMS.filter((a) => tienePatente(a.patente));
  const enAdministracion = ABMS.some((a) => pathname === a.ruta || pathname.startsWith(`${a.ruta}/`));

  return (
    <>
      <nav className="navbar navbar-expand-lg barra-app mb-4">
        <div className="container-fluid">
          <Link className="navbar-brand d-flex align-items-center gap-2" to="/">
            <img src="/favicon.png" alt="" className="logo-app" width={30} height={30} />
            {appNombre}
          </Link>
          <button
            className="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#menuPrincipal"
            aria-controls="menuPrincipal"
            aria-expanded="false"
            aria-label="Mostrar menú"
          >
            <span className="navbar-toggler-icon" />
          </button>
          <div className="collapse navbar-collapse" id="menuPrincipal">
            <ul className="navbar-nav me-auto">
              <li className="nav-item">
                <NavLink className={claseLink} to="/carga-horas">Carga de horas</NavLink>
              </li>
              {abms.length > 0 && (
                <li className="nav-item dropdown">
                  <a
                    className={`nav-link dropdown-toggle${enAdministracion ? ' active' : ''}`}
                    href="#"
                    role="button"
                    data-bs-toggle="dropdown"
                    aria-expanded="false"
                  >
                    Administración
                  </a>
                  <ul className="dropdown-menu">
                    {abms.map((a) => (
                      <li key={a.ruta}>
                        <Link className="dropdown-item" to={a.ruta}>{a.texto}</Link>
                      </li>
                    ))}
                  </ul>
                </li>
              )}
              {tienePatente(Patente.VER_REPORTES) && (
                <li className="nav-item">
                  <NavLink className={claseLink} to="/reportes">Reportes</NavLink>
                </li>
              )}
            </ul>
            <span className="navbar-text me-3" title={sesion.familia}>{sesion.nombre}</span>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => void salir()}>
              Salir
            </button>
          </div>
        </div>
      </nav>

      <main className="container-fluid px-4">
        <VisorMensajes />
        <Outlet />
      </main>
    </>
  );
}
