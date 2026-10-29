/** Nombres de las patentes (pat_nombre). Deben coincidir con los datos semilla de database/02_seed.sql. */
export const Patente = {
  CARGA_HORAS: 'CARGA_HORAS',
  ABM_PROYECTOS: 'ABM_PROYECTOS',
  ABM_CATEGORIAS: 'ABM_CATEGORIAS',
  ABM_TAREAS: 'ABM_TAREAS',
  ABM_USUARIOS: 'ABM_USUARIOS',
  ABM_FAMILIAS: 'ABM_FAMILIAS',
  ABM_PATENTES: 'ABM_PATENTES',
  ABM_GRUPOS: 'ABM_GRUPOS',
  VER_REPORTES: 'VER_REPORTES',
} as const;
export type PatenteCodigo = (typeof Patente)[keyof typeof Patente];

/** IDs fijos de familias sembrados en database/02_seed.sql. */
export const FamiliaId = {
  /** Familia sugerida por defecto al dar de alta un usuario. */
  Empleado: 1,
  Administrador: 2,
} as const;

/**
 * IDs fijos de categorías sembrados en database/02_seed.sql. La categoría no define reglas de GLPI
 * (eso lo define el proyecto con "Se carga por ticket GLPI"); se usa para agrupar y en reportes.
 */
export const CategoriaId = {
  MantenimientoYSoporte: 1,
  OtrasTareas: 2,
  Proyectos: 3,
} as const;

/** Filtro de estado de los listados de los ABM (por defecto, activos). */
export type FiltroEstado = 'activos' | 'inactivos' | 'todos';

export function parsearEstado(valor: unknown): FiltroEstado {
  const texto = typeof valor === 'string' ? valor.toLowerCase() : '';
  return texto === 'inactivos' || texto === 'todos' ? texto : 'activos';
}

/** Condición SQL para el filtro de estado sobre la columna indicada (vacía si es "todos"). */
export function condicionEstado(columna: string, estado: FiltroEstado): string | undefined {
  if (estado === 'activos') return `${columna} = 1`;
  if (estado === 'inactivos') return `${columna} = 0`;
  return undefined;
}
