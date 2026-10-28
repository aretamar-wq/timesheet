import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { PatenteCodigo } from '../dominio/constantes.js';
import { obtenerSesion, type Sesion } from './seguridadService.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sesion?: Sesion;
    }
  }
}

const COOKIE = 'timesheet_sesion';
/** Se vuelve a emitir la cookie si pasó más de este tiempo desde la última (sesión deslizante). */
const RENOVAR_CADA_MS = 15 * 60 * 1000;

interface ContenidoCookie {
  login: string;
  iat: number;
}

/** La cookie solo guarda el login (firmado); los permisos se leen de la base en cada request. */
export function emitirSesion(res: Response, login: string): void {
  const token = jwt.sign({ login }, config.sesion.secreto, {
    algorithm: 'HS256',
    expiresIn: `${config.sesion.horas}h`,
  });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: config.sesion.cookieSegura,
    sameSite: 'strict',
    path: '/',
    maxAge: config.sesion.horas * 3600 * 1000,
  });
}

export function cerrarSesion(res: Response): void {
  res.clearCookie(COOKIE, { httpOnly: true, secure: config.sesion.cookieSegura, sameSite: 'strict', path: '/' });
}

function leerCookie(req: Request): ContenidoCookie | undefined {
  const token = (req.cookies as Record<string, string> | undefined)?.[COOKIE];
  if (!token) return undefined;
  try {
    const contenido = jwt.verify(token, config.sesion.secreto, { algorithms: ['HS256'] });
    if (typeof contenido === 'object' && typeof contenido.login === 'string' && typeof contenido.iat === 'number') {
      return { login: contenido.login, iat: contenido.iat };
    }
  } catch {
    // vencida o adulterada: se trata como sin sesión
  }
  return undefined;
}

/**
 * Exige usuario logueado. Resuelve Familia y Patentes desde la base en cada request: una baja de usuario o un
 * cambio de permisos impacta en el request siguiente. Responde 401 si no hay sesión válida.
 */
export async function requiereSesion(req: Request, res: Response, next: NextFunction): Promise<void> {
  const cookie = leerCookie(req);
  const sesion = cookie ? await obtenerSesion(cookie.login) : undefined;
  if (!cookie || !sesion) {
    if (cookie) cerrarSesion(res);
    res.status(401).json({ mensaje: 'La sesión no es válida o venció. Ingrese nuevamente.' });
    return;
  }
  if (Date.now() - cookie.iat * 1000 > RENOVAR_CADA_MS) emitirSesion(res, sesion.login);
  req.sesion = sesion;
  next();
}

/** Exige la patente indicada (después de requiereSesion). Responde 403 si no la tiene. */
export function requierePatente(patente: PatenteCodigo) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.sesion?.patentes.includes(patente)) {
      res.status(403).json({ mensaje: 'No tiene permiso para acceder a esta sección.' });
      return;
    }
    next();
  };
}

/**
 * Protección CSRF para los métodos que modifican datos: además de la cookie SameSite=Strict, exige el header
 * X-Requested-With que solo puede poner el frontend propio (un formulario de otro sitio no puede agregarlo).
 */
export function requiereHeaderAjax(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.get('X-Requested-With') !== 'fetch') {
    res.status(403).json({ mensaje: 'Solicitud rechazada.' });
    return;
  }
  next();
}

/** Sesión del request (las rutas protegidas siempre la tienen). */
export function sesionDe(req: Request): Sesion {
  if (!req.sesion) throw new Error('Ruta sin requiereSesion.');
  return req.sesion;
}
