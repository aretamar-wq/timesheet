import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import './estilos/site.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { App } from './App';
import { MensajesProvider } from './componentes/Mensajes';
import { SesionProvider } from './sesion/SesionContext';

function Raiz() {
  return (
    <SesionProvider>
      <MensajesProvider>
        <App />
      </MensajesProvider>
    </SesionProvider>
  );
}

// Router "de datos" (createBrowserRouter) para poder usar useBlocker en la carga de horas; las rutas en sí
// están en App (<Routes>).
const router = createBrowserRouter([{ path: '*', element: <Raiz /> }]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
