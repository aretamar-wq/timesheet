/** Tipos de las respuestas de la API (ver backend/src/servicios y backend/src/rutas). */

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

/** IDs fijos de los datos semilla. */
export const FamiliaId = { Empleado: 1, Administrador: 2 } as const;
export const CategoriaId = { MantenimientoYSoporte: 1, OtrasTareas: 2, Proyectos: 3 } as const;

export type FiltroEstado = 'activos' | 'inactivos' | 'todos';

export interface Sesion {
  usuarioId: number;
  login: string;
  nombre: string;
  familiaId: number;
  familia: string;
  patentes: string[];
}

/* ---------- Carga de horas ---------- */

export interface FilaCarga {
  proyectoId: number;
  proyecto: string;
  categoriaId: number;
  tareaId: number | null;
  tarea: string | null;
  glpi: number | null;
  editable: boolean;
  motivoNoEditable: string | null;
  /** Horas decimales por día (índice 0 = lunes); null = sin carga. */
  horas: (number | null)[];
}

export interface DiaSemana {
  fecha: string;
  finDeSemana: boolean;
}

export interface ProyectoCarga {
  id: number;
  nombre: string;
  categoria: string;
  usaGlpi: boolean;
}

export interface SemanaCarga {
  lunes: string;
  hoy: string;
  dias: DiaSemana[];
  filas: FilaCarga[];
  proyectos: ProyectoCarga[];
}

export interface OpcionTarea {
  id: number;
  nombre: string;
  glpi: number;
}

export interface ResultadoAltaTarea {
  tarea: OpcionTarea;
  yaExistia: boolean;
}

/* ---------- ABM ---------- */

export interface Categoria {
  id: number;
  nombre: string;
  activo: boolean;
}

export interface CategoriaListado extends Categoria {
  proyectosActivos: number;
}

export interface Proyecto {
  id: number;
  nombre: string;
  categoriaId: number;
  usaGlpi: boolean;
  activo: boolean;
}

export interface OpcionProyecto extends Proyecto {
  categoria: string;
}

export interface ProyectoListado extends OpcionProyecto {
  categoriaActiva: boolean;
  tareasActivas: number;
}

export interface Tarea {
  id: number;
  proyectoId: number;
  nombre: string;
  glpi: number;
  activo: boolean;
}

export interface TareaDetalle extends Tarea {
  horasCargadas: number | null;
}

export interface TareaListado extends Tarea {
  proyecto: string;
  proyectoActivo: boolean;
  horas: number | null;
}

export interface Usuario {
  id: number;
  login: string;
  nombre: string;
  familiaId: number;
  activo: boolean;
}

export interface UsuarioListado extends Usuario {
  familia: string;
  familiaActiva: boolean;
}

export type ResultadoBusquedaAD =
  | { encontrado: false }
  | { encontrado: true; login: string; nombre: string; habilitado: boolean };

export interface Familia {
  id: number;
  nombre: string;
  activo: boolean;
}

export interface FamiliaDetalle extends Familia {
  patenteIds: number[];
}

export interface FamiliaListado extends Familia {
  patentesActivas: number;
  usuariosActivos: number;
}

export interface Grupo {
  id: number;
  nombre: string;
  activo: boolean;
}

export interface GrupoDetalle extends Grupo {
  usuarioIds: number[];
}

export interface GrupoListado extends Grupo {
  usuariosActivos: number;
}

export interface UsuarioDeGrupo {
  id: number;
  login: string;
  nombre: string;
  activo: boolean;
}

export interface PatenteItem {
  id: number;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

export interface PatenteListado extends PatenteItem {
  familiasActivas: number;
}

/** Respuesta de alta/modificación. */
export interface IdGuardado {
  id: number;
}

/* ---------- Reportes ---------- */

export interface OpcionFiltro {
  id: number;
  texto: string;
}

export interface Periodo {
  desde: string;
  hasta: string;
}

export interface OpcionesReporte {
  usuarios: OpcionFiltro[];
  grupos: OpcionFiltro[];
  proyectos: OpcionFiltro[];
  categorias: OpcionFiltro[];
  mesActual: Periodo;
  mesAnterior: Periodo;
  maximoFilas: number;
}

export interface FiltroReporte {
  desde: string;
  hasta: string;
  usuarioIds: number[];
  grupoIds: number[];
  proyectoId?: number;
  categoriaId?: number;
  tarea: string;
}

export interface FilaReporte {
  proyecto: string;
  categoria: string;
  tarea: string | null;
  glpi: number | null;
  usuario: string;
  fecha: string;
  duracion: number;
}

export interface ResultadoReporte {
  filtro: FiltroReporte;
  filas: FilaReporte[];
  cantidadRegistros: number;
  totalHoras: number;
  truncado: boolean;
}
