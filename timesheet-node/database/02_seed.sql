/*
    Sistema de Carga de Horas - Área Aplicaciones
    02_seed.sql - Datos semilla (categorías, proyectos, familias, patentes y usuario administrador inicial).

    Ejecutar con:  mariadb -u root -p < 02_seed.sql
    Es idempotente: solo inserta lo que falta.

    Los IDs de categorías, familias y patentes son fijos porque el código los referencia
    (ver backend/src/dominio/constantes.ts).
*/
USE timesheet;
-- La misma collation que las tablas: si no, comparar con las variables @... da "Illegal mix of collations".
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_520_ci;

/* ---------- Usuario administrador inicial: CAMBIAR por el login de AD correspondiente ---------- */
SET @AdminLogin  = 'dtamaroff';
SET @AdminNombre = 'Administrador inicial';

START TRANSACTION;

/* Categorías */
INSERT INTO Categorias (cat_id, cat_nombre)
SELECT v.id, v.nombre
FROM (SELECT 1 AS id, 'Mantenimiento y Soporte' AS nombre
      UNION ALL SELECT 2, 'Otras Tareas'
      UNION ALL SELECT 3, 'Proyectos') AS v
WHERE NOT EXISTS (SELECT 1 FROM Categorias c WHERE c.cat_id = v.id);

/* Proyectos iniciales (sin ID fijo: el código no los referencia). Se identifican por nombre, que es único.
   usa_glpi = 1: se cargan por ticket GLPI (las horas van contra una tarea). */
INSERT INTO Proyectos (pro_nombre, pro_cat, pro_usa_glpi)
SELECT v.nombre, v.cat, v.usa_glpi
FROM (
        /* 1 - Mantenimiento y Soporte */
        SELECT 'Gestión de Incidentes y Solicitudes Operativas' AS nombre, 1 AS cat, 1 AS usa_glpi
        UNION ALL SELECT 'Atención de Requerimientos de Cambio',           1, 1
        UNION ALL SELECT 'Gestión de Cambios',                             1, 0
        UNION ALL SELECT 'Planificación y Control de Gestión',             1, 0
        UNION ALL SELECT 'Gestión de Arquitectura y Activos',              1, 0
        UNION ALL SELECT 'Gestión de Auditorías, Riesgos y Cumplimiento',  1, 0
        /* 2 - Otras Tareas */
        UNION ALL SELECT 'Mejora de Procesos y Herramientas',              2, 0
        UNION ALL SELECT 'Capacitación',                                   2, 0
        UNION ALL SELECT 'Licencias por Vacaciones',                       2, 0
        UNION ALL SELECT 'Licencias Varias',                               2, 0
        UNION ALL SELECT 'Tareas Varias',                                  2, 0
        /* 3 - Proyectos */
        UNION ALL SELECT 'Plataforma Trading',                             3, 0
        UNION ALL SELECT 'Proyecto Worldsys',                              3, 0
        UNION ALL SELECT 'Evolución de Servicios Digitales',               3, 0
        UNION ALL SELECT 'Mejora de Procesos de PLAyFT',                   3, 0
        UNION ALL SELECT 'Mejora de Procesos de Préstamos',                3, 0
        UNION ALL SELECT 'Integraciones PSP / API Banking',                3, 0
     ) AS v
WHERE NOT EXISTS (SELECT 1 FROM Proyectos p WHERE p.pro_nombre = v.nombre);

/* Familias */
INSERT INTO Familias (fam_id, fam_nombre)
SELECT v.id, v.nombre
FROM (SELECT 1 AS id, 'Empleado' AS nombre
      UNION ALL SELECT 2, 'Administrador') AS v
WHERE NOT EXISTS (SELECT 1 FROM Familias f WHERE f.fam_id = v.id);

/* Patentes */
INSERT INTO Patentes (pat_id, pat_nombre, pat_descripcion)
SELECT v.id, v.nombre, v.descr
FROM (SELECT 1 AS id, 'CARGA_HORAS' AS nombre, 'Carga de horas semanal' AS descr
      UNION ALL SELECT 2, 'ABM_PROYECTOS',  'Administración de proyectos'
      UNION ALL SELECT 3, 'ABM_CATEGORIAS', 'Administración de categorías'
      UNION ALL SELECT 4, 'ABM_TAREAS',     'Administración de tareas'
      UNION ALL SELECT 5, 'ABM_USUARIOS',   'Administración de usuarios'
      UNION ALL SELECT 6, 'ABM_FAMILIAS',   'Administración de familias'
      UNION ALL SELECT 7, 'ABM_PATENTES',   'Administración de patentes'
      UNION ALL SELECT 8, 'VER_REPORTES',   'Consulta y exportación de reportes'
      UNION ALL SELECT 9, 'ABM_GRUPOS',     'Administración de grupos de usuarios') AS v
WHERE NOT EXISTS (SELECT 1 FROM Patentes p WHERE p.pat_id = v.id);

/* Familia_Patente: Empleado -> CARGA_HORAS; Administrador -> todas */
INSERT INTO Familia_Patente (fam_id, pat_id)
SELECT 1, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Familia_Patente WHERE fam_id = 1 AND pat_id = 1);

INSERT INTO Familia_Patente (fam_id, pat_id)
SELECT 2, p.pat_id
FROM Patentes p
WHERE p.pat_id BETWEEN 1 AND 9
  AND NOT EXISTS (SELECT 1 FROM Familia_Patente fp WHERE fp.fam_id = 2 AND fp.pat_id = p.pat_id);

/* Usuario administrador inicial */
INSERT INTO Usuarios (usu_nombre, usu_login, usu_fam)
SELECT @AdminNombre, @AdminLogin, 2 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Usuarios WHERE usu_login = @AdminLogin);

COMMIT;
