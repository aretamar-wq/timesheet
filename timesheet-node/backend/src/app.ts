import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { NoEncontradoError, ReglaNegocioError } from './errores.js';
import { requiereHeaderAjax, requiereSesion } from './seguridad/middleware.js';
import { rutasCategorias, rutasFamilias, rutasPatentes, rutasProyectos, rutasTareas, rutasUsuarios } from './rutas/abm.js';
import { rutasAuth } from './rutas/auth.js';
import { rutasCargaHoras } from './rutas/cargaHoras.js';
import { rutasReportes } from './rutas/reportes.js';

export function crearApp(): express.Express {
  const app = express();

  // nginx corre en el mismo servidor: confiar en X-Forwarded-For/Proto solo si viene de localhost.
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const api = express.Router();
  api.use(requiereHeaderAjax);
  api.use('/auth', rutasAuth);

  // Todo lo demás requiere sesión; cada grupo exige además su patente.
  api.use(requiereSesion);
  api.use('/carga', rutasCargaHoras);
  api.use('/categorias', rutasCategorias);
  api.use('/proyectos', rutasProyectos);
  api.use('/tareas', rutasTareas);
  api.use('/usuarios', rutasUsuarios);
  api.use('/familias', rutasFamilias);
  api.use('/patentes', rutasPatentes);
  api.use('/reportes', rutasReportes);

  app.use('/api', api);
  app.use('/api', (_req, res) => {
    res.status(404).json({ mensaje: 'No encontrado.' });
  });

  // Errores: reglas de negocio → 400 con el mensaje; el resto se registra y responde un mensaje genérico.
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ReglaNegocioError) {
      res.status(400).json({ mensaje: error.message });
      return;
    }
    if (error instanceof NoEncontradoError) {
      res.status(404).json({ mensaje: error.message });
      return;
    }
    if ((error as { type?: string })?.type === 'entity.parse.failed') {
      res.status(400).json({ mensaje: 'Solicitud inválida.' });
      return;
    }
    console.error(error);
    res.status(500).json({ mensaje: 'Ocurrió un error inesperado. Intente nuevamente o avise al administrador.' });
  });

  return app;
}
