import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Patente } from './api/tipos';
import { Cargando, NoEncontrado, RequierePatente } from './componentes/Estados';
import { Layout } from './componentes/Layout';
import { CargaHoras } from './paginas/CargaHoras';
import { CategoriaFormulario } from './paginas/categorias/CategoriaFormulario';
import { CategoriasListado } from './paginas/categorias/CategoriasListado';
import { FamiliaFormulario } from './paginas/familias/FamiliaFormulario';
import { FamiliasListado } from './paginas/familias/FamiliasListado';
import { FeriadoFormulario } from './paginas/feriados/FeriadoFormulario';
import { FeriadosListado } from './paginas/feriados/FeriadosListado';
import { Login } from './paginas/Login';
import { PatenteFormulario } from './paginas/patentes/PatenteFormulario';
import { PatentesListado } from './paginas/patentes/PatentesListado';
import { ProyectoFormulario } from './paginas/proyectos/ProyectoFormulario';
import { ProyectosListado } from './paginas/proyectos/ProyectosListado';
import { Reportes } from './paginas/Reportes';
import { TareaFormulario } from './paginas/tareas/TareaFormulario';
import { TareasListado } from './paginas/tareas/TareasListado';
import { UsuarioFormulario } from './paginas/usuarios/UsuarioFormulario';
import { UsuariosListado } from './paginas/usuarios/UsuariosListado';
import { useSesion } from './sesion/SesionContext';

/** Rutas. Todo requiere login salvo /login; cada sección exige además su patente (como el backend). */
export function App() {
  const { sesion } = useSesion();
  const ubicacion = useLocation();

  if (sesion === undefined) return <div className="container-fluid px-4"><Cargando /></div>;

  if (sesion === null) {
    // Sin sesión: login, recordando a dónde quería ir.
    if (ubicacion.pathname === '/login') return <Login />;
    const destino = `${ubicacion.pathname}${ubicacion.search}`;
    return <Navigate to={`/login${destino !== '/' ? `?volver=${encodeURIComponent(destino)}` : ''}`} replace />;
  }

  const con = (patente: Parameters<typeof RequierePatente>[0]['patente'], pagina: JSX.Element) => (
    <RequierePatente patente={patente}>{pagina}</RequierePatente>
  );

  return (
    <Routes>
      <Route path="/login" element={<LoginYaIniciado />} />
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/carga-horas" replace />} />
        <Route path="carga-horas" element={con(Patente.CARGA_HORAS, <CargaHoras />)} />

        <Route path="proyectos" element={con(Patente.ABM_PROYECTOS, <ProyectosListado />)} />
        <Route path="proyectos/nuevo" element={con(Patente.ABM_PROYECTOS, <ProyectoFormulario />)} />
        <Route path="proyectos/:id" element={con(Patente.ABM_PROYECTOS, <ProyectoFormulario />)} />

        <Route path="tareas" element={con(Patente.ABM_TAREAS, <TareasListado />)} />
        <Route path="tareas/nueva" element={con(Patente.ABM_TAREAS, <TareaFormulario />)} />
        <Route path="tareas/:id" element={con(Patente.ABM_TAREAS, <TareaFormulario />)} />

        <Route path="categorias" element={con(Patente.ABM_CATEGORIAS, <CategoriasListado />)} />
        <Route path="categorias/nueva" element={con(Patente.ABM_CATEGORIAS, <CategoriaFormulario />)} />
        <Route path="categorias/:id" element={con(Patente.ABM_CATEGORIAS, <CategoriaFormulario />)} />

        <Route path="feriados" element={con(Patente.ABM_FERIADOS, <FeriadosListado />)} />
        <Route path="feriados/nuevo" element={con(Patente.ABM_FERIADOS, <FeriadoFormulario />)} />
        <Route path="feriados/:id" element={con(Patente.ABM_FERIADOS, <FeriadoFormulario />)} />

        <Route path="usuarios" element={con(Patente.ABM_USUARIOS, <UsuariosListado />)} />
        <Route path="usuarios/nuevo" element={con(Patente.ABM_USUARIOS, <UsuarioFormulario />)} />
        <Route path="usuarios/:id" element={con(Patente.ABM_USUARIOS, <UsuarioFormulario />)} />

        <Route path="familias" element={con(Patente.ABM_FAMILIAS, <FamiliasListado />)} />
        <Route path="familias/nueva" element={con(Patente.ABM_FAMILIAS, <FamiliaFormulario />)} />
        <Route path="familias/:id" element={con(Patente.ABM_FAMILIAS, <FamiliaFormulario />)} />

        <Route path="patentes" element={con(Patente.ABM_PATENTES, <PatentesListado />)} />
        <Route path="patentes/:id" element={con(Patente.ABM_PATENTES, <PatenteFormulario />)} />

        <Route path="reportes" element={con(Patente.VER_REPORTES, <Reportes />)} />
        <Route path="*" element={<NoEncontrado />} />
      </Route>
    </Routes>
  );
}

/** Si ya hay sesión y se entra a /login, se va a la página pedida (o a la carga de horas). */
function LoginYaIniciado() {
  const volver = new URLSearchParams(useLocation().search).get('volver');
  return <Navigate to={volver?.startsWith('/') && !volver.startsWith('//') ? volver : '/carga-horas'} replace />;
}
