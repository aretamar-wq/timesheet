import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { cerrarSesion, emitirSesion, requiereSesion, sesionDe } from '../seguridad/middleware.js';
import { iniciarSesion } from '../seguridad/seguridadService.js';
import { cuerpo } from './parametros.js';

export const rutasAuth = Router();

/** Límite de intentos de login por IP (frena la prueba de contraseñas y el bloqueo de cuentas en AD). */
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { mensaje: 'Demasiados intentos de ingreso. Espere unos minutos y vuelva a intentar.' },
});

// Datos públicos para la pantalla de login (sin sesión).
rutasAuth.get('/config', (_req, res) => {
  res.json({ appNombre: config.appNombre });
});

rutasAuth.post('/login', limiteLogin, async (req, res) => {
  const { login, password } = cuerpo(req);
  const resultado = await iniciarSesion(login, password);
  if (!resultado.exitoso) {
    res.status(400).json({ mensaje: resultado.mensaje });
    return;
  }
  emitirSesion(res, resultado.sesion.login);
  res.json(resultado.sesion);
});

rutasAuth.post('/logout', (_req, res) => {
  cerrarSesion(res);
  res.status(204).end();
});

// Usuario logueado y sus patentes (el frontend arma el menú con esto).
rutasAuth.get('/sesion', requiereSesion, (req, res) => {
  res.json(sesionDe(req));
});
