import { consultar, contiene, pool, primero } from '../db.js';
import { ReglaNegocioError } from '../errores.js';
import { comoNumeroGlpi } from './comun.js';

/**
 * Reporte de horas cargadas. Incluye registros de proyectos, tareas y usuarios dados de baja
 * (regla 5: la baja lógica no oculta horas en reportes).
 */

/** Filtros del reporte. desde/hasta son obligatorios; el resto, opcionales. */
export interface FiltroReporte {
  desde: string;
  hasta: string;
  usuarioId?: number;
  proyectoId?: number;
  categoriaId?: number;
  /** Si es un número, busca ese GLPI exacto (o el texto en la descripción); si no, busca en la descripción. */
  tarea: string;
}

export interface FilaReporte {
  proyecto: string;
  categoria: string;
  tarea: string | null;
  glpi: number | null;
  usuario: string;
  fecha: string;
  /** Horas en decimal (2.5 = 2:30). */
  duracion: number;
}

export interface ResultadoReporte {
  filas: FilaReporte[];
  /** Total de registros que cumplen el filtro (aunque filas esté limitada). */
  cantidadRegistros: number;
  /** Suma de la duración de todos los registros que cumplen el filtro. */
  totalHoras: number;
  /** true si filas no contiene todos los registros. */
  truncado: boolean;
}

/**
 * Ejecuta el reporte. Con maximoFilas, filas trae como mucho esa cantidad (para pantalla), pero
 * cantidadRegistros y totalHoras siempre son sobre todos los registros del filtro.
 */
export async function consultarReporte(filtro: FiltroReporte, maximoFilas?: number): Promise<ResultadoReporte> {
  if (filtro.desde > filtro.hasta) {
    throw new ReglaNegocioError('La fecha desde no puede ser posterior a la fecha hasta.');
  }

  const condiciones = ['t.tie_fecha BETWEEN ? AND ?'];
  const parametros: unknown[] = [filtro.desde, filtro.hasta];
  if (filtro.usuarioId !== undefined) {
    condiciones.push('t.tie_usu = ?');
    parametros.push(filtro.usuarioId);
  }
  if (filtro.proyectoId !== undefined) {
    condiciones.push('t.tie_pro = ?');
    parametros.push(filtro.proyectoId);
  }
  if (filtro.categoriaId !== undefined) {
    condiciones.push('p.pro_cat = ?');
    parametros.push(filtro.categoriaId);
  }
  if (filtro.tarea) {
    const glpi = comoNumeroGlpi(filtro.tarea);
    if (glpi !== undefined) {
      condiciones.push('(ta.tar_glpi = ? OR ta.tar_nombre LIKE ?)');
      parametros.push(glpi, contiene(filtro.tarea));
    } else {
      condiciones.push('ta.tar_nombre LIKE ?');
      parametros.push(contiene(filtro.tarea));
    }
  }

  const desdeDonde = `
       FROM Tiempo t
       JOIN Usuarios u ON u.usu_id = t.tie_usu
       JOIN Proyectos p ON p.pro_id = t.tie_pro
       JOIN Categorias c ON c.cat_id = p.pro_cat
       LEFT JOIN Tareas ta ON ta.tar_id = t.tie_tar
      WHERE ${condiciones.join(' AND ')}`;

  const totales = await primero<{ cantidad: number; total: number | null }>(
    pool,
    `SELECT COUNT(*) AS cantidad, SUM(t.tie_duracion) AS total ${desdeDonde}`,
    parametros,
  );
  const limite = maximoFilas !== undefined ? 'LIMIT ?' : '';
  const filas = await consultar<FilaReporte>(
    pool,
    `SELECT p.pro_nombre AS proyecto, c.cat_nombre AS categoria, ta.tar_nombre AS tarea, ta.tar_glpi AS glpi,
            u.usu_nombre AS usuario, t.tie_fecha AS fecha, t.tie_duracion AS duracion
     ${desdeDonde}
      ORDER BY t.tie_fecha, u.usu_nombre, p.pro_nombre, ta.tar_nombre
      ${limite}`,
    maximoFilas !== undefined ? [...parametros, maximoFilas] : parametros,
  );

  const cantidadRegistros = totales?.cantidad ?? 0;
  return {
    filas,
    cantidadRegistros,
    totalHoras: totales?.total ?? 0,
    truncado: filas.length < cantidadRegistros,
  };
}

export interface OpcionFiltro {
  id: number;
  texto: string;
}

/** Desplegables del filtro. Incluyen registros dados de baja: sus horas siguen apareciendo en los reportes. */
export async function opcionesFiltro(): Promise<{
  usuarios: OpcionFiltro[];
  proyectos: OpcionFiltro[];
  categorias: OpcionFiltro[];
}> {
  const [usuarios, proyectos, categorias] = await Promise.all([
    consultar<OpcionFiltro>(
      pool,
      `SELECT usu_id AS id, CONCAT(usu_nombre, IF(usu_activo, '', ' (dado de baja)')) AS texto
         FROM Usuarios ORDER BY usu_nombre`,
    ),
    consultar<OpcionFiltro>(
      pool,
      `SELECT pro_id AS id, CONCAT(pro_nombre, IF(pro_activo, '', ' (dado de baja)')) AS texto
         FROM Proyectos ORDER BY pro_nombre`,
    ),
    consultar<OpcionFiltro>(
      pool,
      `SELECT cat_id AS id, CONCAT(cat_nombre, IF(cat_activo, '', ' (dada de baja)')) AS texto
         FROM Categorias ORDER BY cat_nombre`,
    ),
  ]);
  return { usuarios, proyectos, categorias };
}
