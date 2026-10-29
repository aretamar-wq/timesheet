# Sistema de Carga de Horas - Área Aplicaciones (versión Node + React + MariaDB)

## Resumen del proyecto

Sistema web interno para que el equipo del área de Aplicaciones cargue sus horas trabajadas, reemplazando la aplicación externa (gratuita) que se usa actualmente.

- **Alcance**: carga de horas semanal, administración de tablas maestras (proyectos, tareas, categorías, usuarios, seguridad) y un módulo de reportes.
- **Sin aprobaciones**: a diferencia de la app actual, no hay flujo de aprobación de horas por parte de un supervisor.
- **Usuarios**: miembros del equipo de Aplicaciones. El acceso a cada funcionalidad depende de la Familia de seguridad de cada usuario.
- **Autenticación**: contra Active Directory del dominio de la empresa, sin manejo de contraseñas propio.

## Modelo de datos - Negocio

**Categorias**

- `cat_id` (PK)
- `cat_nombre`
- `cat_activo` (bit) — baja lógica
- Datos semilla (IDs fijos, referenciados desde código): 1 `Mantenimiento y Soporte`, 2 `Otras Tareas`, 3 `Proyectos`

**Proyectos**

- `pro_id` (PK)
- `pro_nombre`
- `pro_cat` (FK → Categorias.cat\_id) — solo agrupa (y se usa en reportes); no define reglas de GLPI
- `pro_usa_glpi` (bit) — "Se carga por ticket GLPI". `1`: el proyecto tiene tareas (cada tarea es un ticket GLPI) y las horas van siempre contra una tarea. `0`: el proyecto no tiene tareas; las horas se cargan directo contra el proyecto
- `pro_activo` (bit) — baja lógica
- Datos semilla: los 17 proyectos iniciales del área están en `database/02_seed.sql` (sin ID fijo, se insertan por nombre si faltan)

**Tareas**

- `tar_id` (PK)
- `tar_pro` (FK → Proyectos.pro\_id) — un proyecto tiene muchas tareas; solo proyectos con `pro_usa_glpi = 1` tienen tareas
- `tar_nombre`
- `tar_glpi` (int, NOT NULL) — número de ticket GLPI; **obligatorio**: una tarea es un ticket GLPI (si hay tarea, hay GLPI). Único por proyecto, contando también las tareas dadas de baja (`UQ_Tareas_pro_glpi`)
- `tar_activo` (bit) — baja lógica

**Usuarios**

- `usu_id` (PK)
- `usu_nombre`
- `usu_login` — usuario de red / Active Directory
- `usu_fam` (FK → Familias.fam\_id)
- `usu_activo` (bit) — baja lógica

**Tiempo**

- `tie_id` (PK)
- `tie_fecha`
- `tie_usu` (FK → Usuarios.usu\_id)
- `tie_pro` (FK → Proyectos.pro\_id) — obligatorio
- `tie_tar` (FK → Tareas.tar\_id) — obligatorio si el proyecto tiene `pro_usa_glpi = 1`; NULL si no (ver regla 7)
- `tie_duracion` (decimal(4,2)) — horas en formato decimal (ej. 2:30 = 2.50)

Restricción: unicidad de `(tie_usu, tie_pro, tie_tar, tie_fecha)` para evitar duplicados en la misma celda de carga. Incluye `tie_pro` porque `tie_tar` es opcional: MariaDB trata cada NULL como distinto en un índice UNIQUE, por eso la restricción usa la columna generada `tie_tar_clave = IFNULL(tie_tar, 0)`.

Regla de integridad: si `tie_tar` está cargado, la Tarea debe pertenecer al mismo Proyecto que `tie_pro`. Se valida en backend (`tiempoService.ts`) y además en la base con una FK compuesta `(tie_tar, tie_pro) → Tareas(tar_id, tar_pro)`.

## Modelo de datos - Seguridad

Modelo de 3 niveles: Usuario → Familia → Patente. Cada Usuario pertenece a una sola Familia; cada Familia agrupa varias Patentes (permisos); un Usuario hereda todas las Patentes de su Familia.

**Familias**

- `fam_id` (PK)
- `fam_nombre`
- `fam_activo` (bit) — baja lógica

**Patentes**

- `pat_id` (PK)
- `pat_nombre` — único; es la clave que usa el código (`Patente` en `backend/src/dominio/constantes.ts`), no debería renombrarse
- `pat_descripcion`
- `pat_activo` (bit) — baja lógica

**Familia\_Patente** (relación muchos a muchos)

- `fam_id` (FK → Familias.fam\_id)
- `pat_id` (FK → Patentes.pat\_id)

**Usuarios** — ver campos de seguridad en la sección de modelo de negocio (`usu_login`, `usu_fam`, `usu_activo`).

**Grupos** (script `database/04_grupos.sql`) — reúnen usuarios para agrupar personas y filtrar reportes; **no otorgan permisos** (eso lo hacen las Familias). Un usuario puede estar en varios grupos.

- `gru_id` (PK)
- `gru_nombre` — único (sin distinguir mayúsculas ni tildes)
- `gru_activo` (bit) — baja lógica

**Grupo\_Usuario** (relación muchos a muchos): `gru_id` (FK → Grupos.gru\_id), `usu_id` (FK → Usuarios.usu\_id).

## Datos semilla de seguridad

**Familias** (2 registros iniciales)

- `Empleado`
- `Administrador`

**Patentes** (9 registros iniciales, desglosadas por función — permite crear familias intermedias a futuro sin cambiar estructura)

- `CARGA_HORAS`
- `ABM_PROYECTOS`
- `ABM_CATEGORIAS`
- `ABM_TAREAS`
- `ABM_USUARIOS`
- `ABM_FAMILIAS`
- `ABM_PATENTES`
- `VER_REPORTES`
- `ABM_GRUPOS`

**Asignación Familia\_Patente**

- `Empleado` → `CARGA_HORAS`
- `Administrador` → las 9 patentes

## Reglas de negocio

1. **Duración en decimal**: `tie_duracion` se guarda como decimal (2.5 = 2:30). El front convierte lo que el usuario tipea en formato `HH:MM` a decimal antes de guardar, y a la inversa para mostrarlo en la grilla.
2. **Validación de duración**: `tie_duracion > 0 AND tie_duracion <= 24`, en **módulos de 30 minutos** (0.5, 1.0, 1.5 … 24.0). Así los valores son exactos en `decimal(4,2)` y los totales no pierden minutos. Se hace cumplir en la base (`CK_Tiempo_duracion`), en backend (`tiempoService.ts`) y en la UI (solo `:00` / `:30`).
3. **Tarea = ticket GLPI**: toda tarea tiene GLPI (`tar_glpi NOT NULL`), y solo pueden tener tareas los proyectos que se cargan por ticket GLPI (`pro_usa_glpi = 1`), sin importar la categoría. Se valida en backend (`tareaService.ts`). Esto reemplaza la definición original, que ataba el GLPI a la categoría `Mantenimiento y Soporte`.
4. **Consistencia Proyecto-Tarea en Tiempo**: si `tie_tar` está cargado, debe pertenecer al mismo `tie_pro`. El desplegable de tareas en la carga de horas debe filtrar solo por las tareas del proyecto ya seleccionado; validar también en backend.
5. **Baja lógica**: dar de baja un Proyecto, Tarea o Usuario nunca borra el registro físicamente — se marca `activo = false`. Las horas ya cargadas contra ese registro no se modifican ni se ocultan en reportes. Los desplegables de carga de horas solo muestran registros `activo = true`.
6. **Unicidad de carga**: no puede haber dos registros de Tiempo con el mismo `(tie_usu, tie_pro, tie_tar, tie_fecha)` — cada celda de la grilla es un único valor.
7. **Tarea según el proyecto**: si el proyecto se carga por ticket GLPI (`pro_usa_glpi = 1`), las horas se cargan siempre contra una tarea (`tie_tar` obligatorio); si no, el proyecto no admite tareas (`tie_tar` NULL). Se valida en backend (`tiempoService.ts`, al guardar; borrar horas existentes no lo exige) y en la UI.
8. **Cambio de "Se carga por ticket GLPI"**: no se puede desmarcar en un proyecto con tareas activas (hay que darlas de baja antes). Las horas cargadas con la configuración anterior se conservan, pero en la grilla quedan en solo lectura.

## Stack tecnológico y autenticación

Es la migración de la versión ASP.NET / VB.NET / SQL Server (`C:\proyectos\timesheetapp`). Mantiene las mismas reglas, pantallas y comportamiento.

| Capa | Tecnología |
| --- | --- |
| Servidor web | nginx: sirve el frontend compilado y deriva `/api` al backend |
| Backend | Node.js 22 + Express 5 + TypeScript (ESM, `tsc`) |
| Acceso a datos | SQL directo con `mysql2/promise`, sin ORM |
| Base de datos | MariaDB 10.6 o superior |
| Frontend | React 18 + TypeScript + Vite + React Router 6 + Bootstrap 5.3.8 |
| Servidor | Linux sin Docker. El backend corre como servicio systemd (`timesheet-api`) |

**Autenticación**: contra Active Directory (`bv.voii.com.ar`) con `ldapts`. Se recomienda LDAPS o STARTTLS.

- Como el servidor Linux no está en el dominio, se usa una **cuenta de servicio** de solo lectura (`AD_BIND_USUARIO`).
- Para el login, se busca el DN del usuario con esa cuenta y se hace bind con su contraseña.
- `AD_MODO=simulado` acepta cualquier contraseña. Solo funciona en desarrollo: con `NODE_ENV=production` se rechaza.

AD valida identidad; la aplicación es la única fuente de verdad sobre permisos (Familia/Patentes).

## Estructura e implementación

```
timesheet-node/
├─ database/    01_schema.sql, 02_seed.sql (idempotente), 03_usuario_app.sql (usuario MariaDB de la app),
│               04_grupos.sql (grupos de usuarios; idempotente)
├─ backend/     src/config.ts (.env), db.ts, dominio/ (constantes, duracion, fechas), seguridad/ (AD, sesión,
│               middleware), servicios/ (reglas de negocio), rutas/ (API), exportacion/ (Excel/TXT)
├─ frontend/    src/api/ (cliente fetch + tipos), sesion/, componentes/ (Layout, Abm, Mensajes, Estados),
│               hooks/, utils/, paginas/ (una por pantalla), estilos/site.css
├─ deploy/      nginx/, systemd/, backup/
└─ INSTALACION.md
```

- **Schema**: se administra con los scripts de `database/`. Todo cambio va en un script nuevo (`04_...sql`).
  - Collation `utf8mb4_unicode_520_ci`: los nombres únicos y las búsquedas no distinguen mayúsculas ni tildes.
  - Los scripts empiezan con `SET NAMES ... COLLATE utf8mb4_unicode_520_ci`. Sin eso, comparar contra variables de sesión da "Illegal mix of collations".
  - Los nombres de tabla se escriben siempre con la misma capitalización (`Tiempo`, `Proyectos`, …), porque en Linux los nombres de tabla de MariaDB distinguen mayúsculas.
- **Datos en el backend**:
  - Columnas mapeadas con alias SQL a camelCase (`pro_cat AS categoriaId`).
  - El pool convierte `BOOLEAN` a true/false, `DECIMAL` a number y `DATE` a texto `'yyyy-MM-dd'`. Las fechas se manejan siempre como ese texto (`dominio/fechas.ts`, cálculos en UTC).
- **Reglas de negocio**:
  - Viven en `backend/src/servicios/*`. Las violaciones se lanzan como `ReglaNegocioError` y la API responde 400 con `{ mensaje }`, apto para el usuario.
  - Las carreras contra restricciones UNIQUE se traducen con `esDuplicado()`.
- **API**: JSON bajo `/api`.
  - Patrón de los ABM: `GET /` (listado con filtros), `GET /:id`, `POST /` (alta), `PUT /:id` (modificación) y `PUT /:id/estado { activo }` (baja lógica o reactivación).
  - Los desplegables que necesita cada pantalla se exponen dentro de su propio grupo, por ejemplo `/proyectos/categorias` y `/usuarios/familias`, así cada uno queda bajo la patente de esa pantalla.
- **Sesión y permisos**:
  - Cookie `timesheet_sesion` con un JWT firmado, httpOnly y SameSite=Strict. Solo guarda el login.
  - En cada request (`requiereSesion`) se resuelven Familia y Patentes desde la base, así una baja o un cambio de permisos impacta en el request siguiente.
  - La sesión dura `SESION_HORAS` y se renueva sola mientras se usa.
  - Protección CSRF: los métodos que no son GET exigen el header `X-Requested-With: fetch`, que pone `src/api/cliente.ts`.
  - El login tiene límite de intentos por IP.
- **Autorización**: cada router exige su patente con `requierePatente(Patente.X)` y responde 403 si falta. El frontend replica el chequeo con `<RequierePatente>` y arma el menú con las patentes de `/api/auth/sesion`.
- **Frontend**:
  - Los filtros de los listados van en la URL (`useFiltrosUrl`).
  - Formularios en `/x/nuevo` y `/x/:id`. Al guardar o cancelar se vuelve al listado con los mismos filtros, que el link de origen pasa en `state.volver`.
  - Los mensajes de resultado se muestran con `useMensajes()`. `navegarConMensaje` muestra el mensaje en la página de destino, que equivale al TempData de la versión anterior.
  - Se usa `createBrowserRouter` para poder usar `useBlocker` en la carga de horas: al cambiar de sección se esperan los guardados y se avisa si hay celdas con error.
- **Nombre del sistema**: "Cocos Bank Timesheet", configurable en `APP_NOMBRE` del `.env` y leído desde `/api/auth/config`. No hardcodearlo en el frontend.
- **Paleta y marca**: azul marino `#002C65` para los textos de marca y azul `#0062E1` para acciones, links, foco y sección activa.
  - Están definidos como variables en `frontend/src/estilos/site.css` (`--app-marino`, `--app-azul`, …) y reemplazan el azul primario de Bootstrap.
  - No usar colores hardcodeados.
  - El logo es `frontend/public/favicon.png`.
- **Encoding**: UTF-8 sin BOM, que es lo que esperan Node, Vite y los scripts sh. Los `.ps1` que se escriban para Windows sí llevan BOM.
- **Comandos**:
  - Backend: `npm run dev` (tsx watch), `npm run build`, `npm run typecheck`.
  - Frontend: `npm run dev` (puerto 5173, con proxy de `/api` a 127.0.0.1:3000) y `npm run build` (genera `dist/`).
- **Despliegue**: ver `INSTALACION.md`.

## Pantallas y funcionalidades

Mismo comportamiento que la versión anterior. Pantalla, frontend y backend de cada una:

- **Login**: `paginas/Login.tsx`. Backend en `rutas/auth.ts` y `seguridad/*`. Requiere `CARGA_HORAS` como mínimo para ingresar.
- **Carga de horas** (`CARGA_HORAS`):
  - Frontend: `paginas/CargaHoras.tsx`, `paginas/carga/ModalAgregarFila.tsx` y `paginas/carga/horas.ts` (máscara).
  - Backend: `rutas/cargaHoras.ts` y `servicios/tiempoService.ts`.
  - Grilla lunes a domingo con navegación por `?fecha=`.
  - Máscara de horas (`130` → `1:30`), solo `:00`/`:30`, máximo 24:00.
  - Autoguardado por celda con una cola de a uno. Celda vacía = borrar la carga.
  - Totales por fila y por día, con resaltado si un día supera 24 h.
  - Modal "Agregar fila" con buscador de tareas y alta rápida de tarea (cualquier usuario con `CARGA_HORAS`). Si el GLPI ya existe en el proyecto, se reutiliza la tarea.
  - Copiar semana anterior.
  - Filas de solo lectura (regla 8 y bajas).
- **ABM** (`paginas/<tabla>/`, `rutas/abm.ts`, `servicios/<tabla>Service.ts`):
  - **Proyectos**: es el modelo del patrón.
  - **Categorías**.
  - **Tareas**: GLPI único por proyecto, también contra tareas dadas de baja. Una tarea con horas no puede cambiar de proyecto.
  - **Usuarios**: validación en AD con "Verificar en AD" (`/api/usuarios/buscar-ad`).
  - **Familias**.
  - **Grupos** (`ABM_GRUPOS`): nombre + usuarios (checkboxes con buscador). Un usuario puede estar en varios grupos. Backend en `servicios/grupoService.ts`; `GET /api/grupos/usuarios` trae los usuarios para el formulario.
  - **Patentes**: solo consulta y edición de la descripción.
  - Protección contra quedarse afuera, en `servicios/administradores.ts`:
    - Nadie puede darse de baja ni cambiar su propio login.
    - Nadie puede pasarse a una familia sin `ABM_USUARIOS`, ni darle de baja o quitarle `CARGA_HORAS`/`ABM_USUARIOS` a su propia familia.
    - Todo cambio en Familias se guarda con `guardarSinPerderAdministradores`: guarda en una transacción, verifica que quede al menos un administrador activo y, si no, revierte.
- **Reportes** (`VER_REPORTES`):
  - Frontend: `paginas/Reportes.tsx`. Backend: `rutas/reportes.ts`, `servicios/reporteService.ts` y `exportacion/exportadorReporte.ts`.
  - Filtros por fechas (por defecto el mes actual, con accesos rápidos a mes actual y mes anterior), usuarios (uno o varios, desplegable con casillas; viajan como `usuarioIds=3,7`), grupos (uno o varios, igual; `grupoIds=1,2`; trae los usuarios que integran alguno de los grupos y se combina con el filtro de usuarios: deben cumplir ambos), proyecto, categoría y "Tarea / GLPI".
  - Incluye registros dados de baja.
  - En pantalla muestra hasta 2000 filas. El total y la cantidad son siempre sobre todos los registros.
  - **Excel** (`exceljs`): encabezado, autofiltro, filas inmovilizadas, duración `[h]:mm` y total con `SUM`.
  - **TXT**: delimitado por `;`, UTF-8 con BOM, fechas `dd/MM/yyyy`, duración `H:MM`. Lleva comillas cuando hace falta y un apóstrofo delante de los campos que empiezan con `= + - @`.

### Permisos por Familia (con los datos semilla definidos)

- **Empleado**: solo Carga de horas.
- **Administrador**: Carga de horas + ABM de todas las tablas maestras + Reportes.

## Fuera de alcance (v1)

- Flujo de aprobación de horas por parte de un supervisor.
- Usuario perteneciente a más de una Familia a la vez.
- Facturación o integración con nómina.
- Notificaciones o recordatorios automáticos de carga de horas.
- Integración en vivo con GLPI (el número de ticket se carga manualmente en `tar_glpi`, no se consulta a GLPI vía API).
