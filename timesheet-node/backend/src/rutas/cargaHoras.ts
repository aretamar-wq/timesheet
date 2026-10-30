import { Router } from 'express';
import { Patente } from '../dominio/constantes.js';
import { parsearDuracion } from '../dominio/duracion.js';
import { hoy, lunesDe, parsearFecha, sumarDias } from '../dominio/fechas.js';
import { ReglaNegocioError } from '../errores.js';
import { requierePatente, sesionDe } from '../seguridad/middleware.js';
import * as feriados from '../servicios/feriadoService.js';
import * as proyectos from '../servicios/proyectoService.js';
import * as tareas from '../servicios/tareaService.js';
import * as tiempos from '../servicios/tiempoService.js';
import { cuerpo, enteroOpcional, textoOpcional } from './parametros.js';

/**
 * Pantalla principal: grilla semanal de carga de horas. Las celdas se guardan de a una (al salir de la celda).
 * El usuario siempre es el de la sesión, nunca viene del cliente.
 */
export const rutasCargaHoras = Router();
rutasCargaHoras.use(requierePatente(Patente.CARGA_HORAS));

// GET /api/carga/semana?fecha=2026-09-21
rutasCargaHoras.get('/semana', async (req, res) => {
  const fecha = parsearFecha(req.query.fecha) ?? hoy();
  const lunes = lunesDe(fecha);
  const [semana, activos, feriadosSemana] = await Promise.all([
    tiempos.obtenerSemana(sesionDe(req).usuarioId, fecha),
    proyectos.activos(),
    feriados.activosEntre(lunes, sumarDias(lunes, 6)),
  ]);
  // feriado: descripción del feriado activo de ese día (null si no es feriado).
  const dias = Array.from({ length: 7 }, (_, i) => {
    const dia = sumarDias(lunes, i);
    return { fecha: dia, finDeSemana: i >= 5, feriado: feriadosSemana.find((f) => f.fecha === dia)?.descripcion ?? null };
  });
  res.json({
    lunes: semana.lunes,
    hoy: hoy(),
    dias,
    filas: semana.filas,
    proyectos: activos.map((p) => ({ id: p.id, nombre: p.nombre, categoria: p.categoria, usaGlpi: p.usaGlpi })),
  });
});

// PUT /api/carga/celda { fecha, proyectoId, tareaId, duracion: "H:MM" } — duración vacía = borrar la carga.
rutasCargaHoras.put('/celda', async (req, res) => {
  const datos = cuerpo(req);
  const fecha = parsearFecha(datos.fecha);
  const proyectoId = enteroOpcional(datos.proyectoId);
  if (!fecha) throw new ReglaNegocioError('Fecha inválida.');
  if (proyectoId === undefined) throw new ReglaNegocioError('Proyecto inválido.');

  const texto = textoOpcional(datos.duracion);
  const horas = texto === undefined ? 0 : parsearDuracion(texto);
  if (horas === null) throw new ReglaNegocioError('Formato de horas inválido. Use HH:MM.');

  await tiempos.guardarCelda(sesionDe(req).usuarioId, fecha, proyectoId, enteroOpcional(datos.tareaId) ?? null, horas);
  res.json({ ok: true });
});

// GET /api/carga/tareas?proyectoId=1 — tareas activas del proyecto (modal "Agregar fila").
rutasCargaHoras.get('/tareas', async (req, res) => {
  const proyectoId = enteroOpcional(req.query.proyectoId);
  res.json({ tareas: proyectoId === undefined ? [] : await tareas.activas(proyectoId) });
});

// GET /api/carga/semana-anterior?fecha= — filas (sin horas) de la semana anterior.
rutasCargaHoras.get('/semana-anterior', async (req, res) => {
  const fecha = parsearFecha(req.query.fecha);
  if (!fecha) throw new ReglaNegocioError('Fecha inválida.');
  res.json({ filas: await tiempos.filasSemanaAnterior(sesionDe(req).usuarioId, fecha) });
});

// POST /api/carga/tareas { proyectoId, nombre, glpi } — alta rápida de tarea (cualquier usuario con CARGA_HORAS).
rutasCargaHoras.post('/tareas', async (req, res) => {
  const datos = cuerpo(req);
  const textoGlpi = textoOpcional(typeof datos.glpi === 'number' ? String(datos.glpi) : datos.glpi);
  const glpi = textoGlpi === undefined ? undefined : enteroOpcional(textoGlpi);
  if (textoGlpi !== undefined && glpi === undefined) {
    throw new ReglaNegocioError('El número de GLPI debe ser un entero positivo.');
  }
  const resultado = await tareas.crearDesdeCarga({ proyectoId: enteroOpcional(datos.proyectoId), nombre: datos.nombre, glpi });
  res.json(resultado);
});
