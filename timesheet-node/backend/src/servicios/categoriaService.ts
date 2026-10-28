import { consultar, contiene, ejecutar, esDuplicado, existe, pool, primero } from '../db.js';
import { condicionEstado, type FiltroEstado } from '../dominio/constantes.js';
import { ReglaNegocioError } from '../errores.js';
import { filtrosWhere, texto } from './comun.js';

const LARGO_MAXIMO_NOMBRE = 100;

export interface Categoria {
  id: number;
  nombre: string;
  activo: boolean;
}

export interface CategoriaListado extends Categoria {
  proyectosActivos: number;
}

/** Categorías para un desplegable: las activas, más la indicada aunque esté dada de baja. */
export function opciones(incluirId?: number): Promise<Categoria[]> {
  return consultar<Categoria>(
    pool,
    `SELECT cat_id AS id, cat_nombre AS nombre, cat_activo AS activo
       FROM Categorias
      WHERE cat_activo = 1 OR cat_id = ?
      ORDER BY cat_nombre`,
    [incluirId ?? 0],
  );
}

/** Listado del ABM con filtros opcionales por texto (nombre) y estado. */
export function listar(filtroTexto: string | undefined, estado: FiltroEstado): Promise<CategoriaListado[]> {
  const condiciones: string[] = [];
  const parametros: unknown[] = [];
  if (filtroTexto) {
    condiciones.push('c.cat_nombre LIKE ?');
    parametros.push(contiene(filtroTexto));
  }
  const porEstado = condicionEstado('c.cat_activo', estado);
  if (porEstado) condiciones.push(porEstado);

  return consultar<CategoriaListado>(
    pool,
    `SELECT c.cat_id AS id, c.cat_nombre AS nombre, c.cat_activo AS activo,
            (SELECT COUNT(*) FROM Proyectos p WHERE p.pro_cat = c.cat_id AND p.pro_activo = 1) AS proyectosActivos
       FROM Categorias c
      ${filtrosWhere(condiciones)}
      ORDER BY c.cat_nombre`,
    parametros,
  );
}

export function obtener(id: number): Promise<Categoria | undefined> {
  return primero<Categoria>(
    pool,
    'SELECT cat_id AS id, cat_nombre AS nombre, cat_activo AS activo FROM Categorias WHERE cat_id = ?',
    [id],
  );
}

/** Crea (id = 0) o modifica una categoría y devuelve su id. No cambia el estado activo (ver cambiarEstado). */
export async function guardar(id: number, nombreIngresado: unknown): Promise<number> {
  const nombre = texto(nombreIngresado);
  if (!nombre) throw new ReglaNegocioError('El nombre de la categoría es obligatorio.');
  if (nombre.length > LARGO_MAXIMO_NOMBRE) {
    throw new ReglaNegocioError(`El nombre de la categoría no puede superar los ${LARGO_MAXIMO_NOMBRE} caracteres.`);
  }
  const duplicado = `Ya existe una categoría con el nombre "${nombre}".`;

  if (await existe(pool, 'SELECT 1 FROM Categorias WHERE cat_nombre = ? AND cat_id <> ?', [nombre, id])) {
    throw new ReglaNegocioError(duplicado);
  }

  try {
    if (id === 0) {
      const resultado = await ejecutar(pool, 'INSERT INTO Categorias (cat_nombre) VALUES (?)', [nombre]);
      return resultado.insertId;
    }
    if (!(await obtener(id))) throw new ReglaNegocioError('La categoría no existe.');
    await ejecutar(pool, 'UPDATE Categorias SET cat_nombre = ? WHERE cat_id = ?', [nombre, id]);
    return id;
  } catch (error) {
    if (esDuplicado(error)) throw new ReglaNegocioError(duplicado);   // carrera contra UQ_Categorias_nombre
    throw error;
  }
}

/**
 * Baja lógica (activo = false) o reactivación. Los proyectos que ya la usan la conservan;
 * dada de baja, no se puede elegir para proyectos nuevos ni para cambiar la de un proyecto.
 */
export async function cambiarEstado(id: number, activo: boolean): Promise<void> {
  const resultado = await ejecutar(pool, 'UPDATE Categorias SET cat_activo = ? WHERE cat_id = ?', [activo, id]);
  if (resultado.affectedRows === 0) throw new ReglaNegocioError('La categoría no existe.');
}
