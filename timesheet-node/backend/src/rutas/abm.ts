import { Router } from 'express';
import { parsearEstado, Patente } from '../dominio/constantes.js';
import { NoEncontradoError } from '../errores.js';
import { requierePatente, sesionDe } from '../seguridad/middleware.js';
import * as categorias from '../servicios/categoriaService.js';
import * as familias from '../servicios/familiaService.js';
import * as patentes from '../servicios/patenteService.js';
import * as proyectos from '../servicios/proyectoService.js';
import * as tareas from '../servicios/tareaService.js';
import * as usuarios from '../servicios/usuarioService.js';
import { booleano, cuerpo, enteroOpcional, idDeRuta, listaDeEnteros, textoOpcional } from './parametros.js';

/**
 * ABM de tablas maestras. Patrón común: GET / (listado con filtros), GET /:id, POST / (alta), PUT /:id
 * (modificación), PUT /:id/estado { activo } (baja lógica o reactivación). Las reglas viven en los servicios.
 */

function encontrado<T>(valor: T | undefined): T {
  if (valor === undefined) throw new NoEncontradoError();
  return valor;
}

/* ---------- Categorías ---------- */
export const rutasCategorias = Router();
rutasCategorias.use(requierePatente(Patente.ABM_CATEGORIAS));

rutasCategorias.get('/', async (req, res) => {
  res.json(await categorias.listar(textoOpcional(req.query.texto), parsearEstado(req.query.estado)));
});
rutasCategorias.get('/:id', async (req, res) => {
  res.json(encontrado(await categorias.obtener(idDeRuta(req))));
});
rutasCategorias.post('/', async (req, res) => {
  res.status(201).json({ id: await categorias.guardar(0, cuerpo(req).nombre) });
});
rutasCategorias.put('/:id', async (req, res) => {
  res.json({ id: await categorias.guardar(idDeRuta(req), cuerpo(req).nombre) });
});
rutasCategorias.put('/:id/estado', async (req, res) => {
  await categorias.cambiarEstado(idDeRuta(req), booleano(cuerpo(req).activo));
  res.status(204).end();
});

/* ---------- Proyectos ---------- */
export const rutasProyectos = Router();
rutasProyectos.use(requierePatente(Patente.ABM_PROYECTOS));

function datosProyecto(body: Record<string, unknown>): proyectos.DatosProyecto {
  return { nombre: body.nombre, categoriaId: enteroOpcional(body.categoriaId), usaGlpi: booleano(body.usaGlpi) };
}

rutasProyectos.get('/', async (req, res) => {
  res.json(await proyectos.listar(
    textoOpcional(req.query.texto),
    enteroOpcional(req.query.categoriaId),
    parsearEstado(req.query.estado),
  ));
});
// Categorías para el filtro (todas) o el formulario (activas + la actual: ?incluirId=).
rutasProyectos.get('/categorias', async (req, res) => {
  res.json(req.query.todas === '1'
    ? await categorias.listar(undefined, 'todos')
    : await categorias.opciones(enteroOpcional(req.query.incluirId)));
});
rutasProyectos.get('/:id', async (req, res) => {
  res.json(encontrado(await proyectos.obtener(idDeRuta(req))));
});
rutasProyectos.post('/', async (req, res) => {
  res.status(201).json({ id: await proyectos.guardar(0, datosProyecto(cuerpo(req))) });
});
rutasProyectos.put('/:id', async (req, res) => {
  res.json({ id: await proyectos.guardar(idDeRuta(req), datosProyecto(cuerpo(req))) });
});
rutasProyectos.put('/:id/estado', async (req, res) => {
  await proyectos.cambiarEstado(idDeRuta(req), booleano(cuerpo(req).activo));
  res.status(204).end();
});

/* ---------- Tareas ---------- */
export const rutasTareas = Router();
rutasTareas.use(requierePatente(Patente.ABM_TAREAS));

function datosTarea(body: Record<string, unknown>): tareas.DatosTarea {
  return { proyectoId: enteroOpcional(body.proyectoId), nombre: body.nombre, glpi: enteroOpcional(body.glpi) };
}

rutasTareas.get('/', async (req, res) => {
  res.json(await tareas.listar(
    textoOpcional(req.query.texto),
    enteroOpcional(req.query.proyectoId),
    parsearEstado(req.query.estado),
  ));
});
// Proyectos que se cargan por ticket: todos (?todos=1, para el filtro) o activos + el actual (?incluirId=).
rutasTareas.get('/proyectos', async (req, res) => {
  res.json(await proyectos.porTicket(req.query.todos === '1', enteroOpcional(req.query.incluirId)));
});
rutasTareas.get('/:id', async (req, res) => {
  const id = idDeRuta(req);
  const tarea = encontrado(await tareas.obtener(id));
  res.json({ ...tarea, horasCargadas: await tareas.horasCargadas(id) });
});
rutasTareas.post('/', async (req, res) => {
  res.status(201).json({ id: await tareas.guardar(0, datosTarea(cuerpo(req))) });
});
rutasTareas.put('/:id', async (req, res) => {
  res.json({ id: await tareas.guardar(idDeRuta(req), datosTarea(cuerpo(req))) });
});
rutasTareas.put('/:id/estado', async (req, res) => {
  await tareas.cambiarEstado(idDeRuta(req), booleano(cuerpo(req).activo));
  res.status(204).end();
});

/* ---------- Usuarios ---------- */
export const rutasUsuarios = Router();
rutasUsuarios.use(requierePatente(Patente.ABM_USUARIOS));

function datosUsuario(body: Record<string, unknown>): usuarios.DatosUsuario {
  return { login: body.login, nombre: body.nombre, familiaId: enteroOpcional(body.familiaId) };
}

rutasUsuarios.get('/', async (req, res) => {
  res.json(await usuarios.listar(
    textoOpcional(req.query.texto),
    enteroOpcional(req.query.familiaId),
    parsearEstado(req.query.estado),
  ));
});
// Familias para el filtro o el formulario (activas + la indicada en ?incluirId=).
rutasUsuarios.get('/familias', async (req, res) => {
  res.json(await familias.opciones(enteroOpcional(req.query.incluirId)));
});
// Busca el login en Active Directory (para validar y autocompletar el nombre en el formulario).
rutasUsuarios.get('/buscar-ad', async (req, res) => {
  const cuenta = await usuarios.buscarEnDirectorio(req.query.login);
  res.json(cuenta ? { encontrado: true, ...cuenta } : { encontrado: false });
});
rutasUsuarios.get('/:id', async (req, res) => {
  res.json(encontrado(await usuarios.obtener(idDeRuta(req))));
});
rutasUsuarios.post('/', async (req, res) => {
  res.status(201).json({ id: await usuarios.guardar(0, datosUsuario(cuerpo(req)), sesionDe(req).usuarioId) });
});
rutasUsuarios.put('/:id', async (req, res) => {
  res.json({ id: await usuarios.guardar(idDeRuta(req), datosUsuario(cuerpo(req)), sesionDe(req).usuarioId) });
});
rutasUsuarios.put('/:id/estado', async (req, res) => {
  await usuarios.cambiarEstado(idDeRuta(req), booleano(cuerpo(req).activo), sesionDe(req).usuarioId);
  res.status(204).end();
});

/* ---------- Familias ---------- */
export const rutasFamilias = Router();
rutasFamilias.use(requierePatente(Patente.ABM_FAMILIAS));

rutasFamilias.get('/', async (req, res) => {
  res.json(await familias.listar(textoOpcional(req.query.texto), parsearEstado(req.query.estado)));
});
// Todas las patentes, para los checkboxes del formulario.
rutasFamilias.get('/patentes', async (_req, res) => {
  res.json(await patentes.opciones());
});
rutasFamilias.get('/:id', async (req, res) => {
  res.json(encontrado(await familias.obtener(idDeRuta(req))));
});
rutasFamilias.post('/', async (req, res) => {
  const body = cuerpo(req);
  res.status(201).json({
    id: await familias.guardar(0, body.nombre, listaDeEnteros(body.patenteIds), sesionDe(req).usuarioId),
  });
});
rutasFamilias.put('/:id', async (req, res) => {
  const body = cuerpo(req);
  res.json({
    id: await familias.guardar(idDeRuta(req), body.nombre, listaDeEnteros(body.patenteIds), sesionDe(req).usuarioId),
  });
});
rutasFamilias.put('/:id/estado', async (req, res) => {
  await familias.cambiarEstado(idDeRuta(req), booleano(cuerpo(req).activo), sesionDe(req).usuarioId);
  res.status(204).end();
});

/* ---------- Patentes (solo consulta + descripción) ---------- */
export const rutasPatentes = Router();
rutasPatentes.use(requierePatente(Patente.ABM_PATENTES));

rutasPatentes.get('/', async (req, res) => {
  res.json(await patentes.listar(textoOpcional(req.query.texto)));
});
rutasPatentes.get('/:id', async (req, res) => {
  res.json(encontrado(await patentes.obtener(idDeRuta(req))));
});
rutasPatentes.put('/:id', async (req, res) => {
  await patentes.modificarDescripcion(idDeRuta(req), cuerpo(req).descripcion);
  res.status(204).end();
});
