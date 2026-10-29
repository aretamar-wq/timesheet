import { Router, type Request } from 'express';
import { Patente } from '../dominio/constantes.js';
import { aCompacta, aDiaMesAnio, hoy, parsearFecha, primeroDelMes, sumarDias, sumarMeses } from '../dominio/fechas.js';
import { aExcel, aTexto } from '../exportacion/exportadorReporte.js';
import { requierePatente } from '../seguridad/middleware.js';
import { consultarReporte, opcionesFiltro, type FiltroReporte } from '../servicios/reporteService.js';
import { enteroOpcional, enterosSeparadosPorComa, textoOpcional } from './parametros.js';

/**
 * Reporte de horas: filtros por fecha, usuarios (uno o varios), proyecto, categoría y tarea/GLPI; resultado con total al pie y
 * exportación a Excel (.xlsx) y TXT. Todos los endpoints son GET con los mismos parámetros de filtro.
 */
export const rutasReportes = Router();
rutasReportes.use(requierePatente(Patente.VER_REPORTES));

/** Máximo de filas en pantalla; la exportación trae siempre todas. */
const MAXIMO_FILAS_PANTALLA = 2000;

function mesActual(): { desde: string; hasta: string } {
  const desde = primeroDelMes(hoy());
  return { desde, hasta: sumarDias(sumarMeses(desde, 1), -1) };
}

/** Filtro a partir de los parámetros; sin fechas válidas, usa el mes actual. */
function armarFiltro(req: Request): FiltroReporte {
  const mes = mesActual();
  return {
    desde: parsearFecha(req.query.desde) ?? mes.desde,
    hasta: parsearFecha(req.query.hasta) ?? mes.hasta,
    usuarioIds: enterosSeparadosPorComa(req.query.usuarioIds),
    proyectoId: enteroOpcional(req.query.proyectoId),
    categoriaId: enteroOpcional(req.query.categoriaId),
    tarea: textoOpcional(req.query.tarea) ?? '',
  };
}

/** Texto que describe el filtro aplicado (va en el encabezado del Excel). */
async function describirFiltro(filtro: FiltroReporte): Promise<string> {
  const opciones = await opcionesFiltro();
  const textoDe = (lista: { id: number; texto: string }[], id: number) =>
    lista.find((o) => o.id === id)?.texto ?? '(inexistente)';

  const partes = [`Período: ${aDiaMesAnio(filtro.desde)} al ${aDiaMesAnio(filtro.hasta)}`];
  if (filtro.usuarioIds.length > 0) {
    const nombres = filtro.usuarioIds.map((id) => textoDe(opciones.usuarios, id)).join(', ');
    partes.push(`${filtro.usuarioIds.length === 1 ? 'Usuario' : 'Usuarios'}: ${nombres}`);
  }
  if (filtro.proyectoId !== undefined) partes.push(`Proyecto: ${textoDe(opciones.proyectos, filtro.proyectoId)}`);
  if (filtro.categoriaId !== undefined) partes.push(`Categoría: ${textoDe(opciones.categorias, filtro.categoriaId)}`);
  if (filtro.tarea) partes.push(`Tarea/GLPI: ${filtro.tarea}`);
  return partes.join('  ·  ');
}

function nombreArchivo(filtro: FiltroReporte, extension: string): string {
  return `horas_${aCompacta(filtro.desde)}_${aCompacta(filtro.hasta)}.${extension}`;
}

// Desplegables del filtro, accesos rápidos de fechas y máximo de filas en pantalla.
rutasReportes.get('/opciones', async (_req, res) => {
  const actual = mesActual();
  const desdeAnterior = sumarMeses(actual.desde, -1);
  res.json({
    ...(await opcionesFiltro()),
    mesActual: actual,
    mesAnterior: { desde: desdeAnterior, hasta: sumarDias(actual.desde, -1) },
    maximoFilas: MAXIMO_FILAS_PANTALLA,
  });
});

// GET /api/reportes?desde=2026-09-01&hasta=2026-09-30&usuarioIds=3,7&proyectoId=&categoriaId=&tarea=
rutasReportes.get('/', async (req, res) => {
  const filtro = armarFiltro(req);
  res.json({ filtro, ...(await consultarReporte(filtro, MAXIMO_FILAS_PANTALLA)) });
});

rutasReportes.get('/excel', async (req, res) => {
  const filtro = armarFiltro(req);
  const contenido = await aExcel(await consultarReporte(filtro), await describirFiltro(filtro));
  res.attachment(nombreArchivo(filtro, 'xlsx'));
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(contenido);
});

rutasReportes.get('/txt', async (req, res) => {
  const filtro = armarFiltro(req);
  const contenido = aTexto(await consultarReporte(filtro));
  res.attachment(nombreArchivo(filtro, 'txt'));
  res.type('text/plain; charset=utf-8').send(contenido);
});
