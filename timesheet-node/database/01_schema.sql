/*
    Sistema de Carga de Horas - Área Aplicaciones
    01_schema.sql - Creación de la base y de las tablas (MariaDB 10.6 o superior).

    Ejecutar con:  mariadb -u root -p < 01_schema.sql
    Es para una instalación nueva: usa CREATE TABLE IF NOT EXISTS, así que si las tablas ya existen no las toca.

    Diferencias con la versión SQL Server:
    - BIT pasa a TINYINT(1) (BOOLEAN).
    - En MariaDB un índice UNIQUE trata cada NULL como distinto: (usuario, proyecto, NULL, fecha) se podría repetir.
      Por eso la unicidad de la celda de Tiempo usa la columna generada tie_tar_clave = IFNULL(tie_tar, 0).
    - Collation utf8mb4_unicode_520_ci: no distingue mayúsculas ni tildes ("Gestion" = "Gestión"), tanto en
      búsquedas como en los nombres únicos.
*/
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_520_ci;

CREATE DATABASE IF NOT EXISTS timesheet
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci;

USE timesheet;

/* =========================  SEGURIDAD  ========================= */

CREATE TABLE IF NOT EXISTS Familias (
    fam_id      INT          NOT NULL AUTO_INCREMENT,
    fam_nombre  VARCHAR(100) NOT NULL,
    fam_activo  BOOLEAN      NOT NULL DEFAULT 1,
    CONSTRAINT PK_Familias PRIMARY KEY (fam_id),
    CONSTRAINT UQ_Familias_nombre UNIQUE (fam_nombre)
) ENGINE = InnoDB;

-- pat_nombre es la clave que usa el código (ej. 'ABM_PROYECTOS'): debe ser única y no debería renombrarse.
CREATE TABLE IF NOT EXISTS Patentes (
    pat_id           INT          NOT NULL AUTO_INCREMENT,
    pat_nombre       VARCHAR(50)  NOT NULL,
    pat_descripcion  VARCHAR(250) NULL,
    pat_activo       BOOLEAN      NOT NULL DEFAULT 1,
    CONSTRAINT PK_Patentes PRIMARY KEY (pat_id),
    CONSTRAINT UQ_Patentes_nombre UNIQUE (pat_nombre)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS Familia_Patente (
    fam_id  INT NOT NULL,
    pat_id  INT NOT NULL,
    CONSTRAINT PK_Familia_Patente PRIMARY KEY (fam_id, pat_id),
    CONSTRAINT FK_Familia_Patente_Familias FOREIGN KEY (fam_id) REFERENCES Familias (fam_id),
    CONSTRAINT FK_Familia_Patente_Patentes FOREIGN KEY (pat_id) REFERENCES Patentes (pat_id)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS Usuarios (
    usu_id      INT          NOT NULL AUTO_INCREMENT,
    usu_nombre  VARCHAR(150) NOT NULL,
    usu_login   VARCHAR(100) NOT NULL,   -- sAMAccountName de AD, sin dominio
    usu_fam     INT          NOT NULL,
    usu_activo  BOOLEAN      NOT NULL DEFAULT 1,
    CONSTRAINT PK_Usuarios PRIMARY KEY (usu_id),
    CONSTRAINT UQ_Usuarios_login UNIQUE (usu_login),
    CONSTRAINT FK_Usuarios_Familias FOREIGN KEY (usu_fam) REFERENCES Familias (fam_id)
) ENGINE = InnoDB;

/* =========================  NEGOCIO  ========================= */

CREATE TABLE IF NOT EXISTS Categorias (
    cat_id      INT          NOT NULL AUTO_INCREMENT,
    cat_nombre  VARCHAR(100) NOT NULL,
    cat_activo  BOOLEAN      NOT NULL DEFAULT 1,
    CONSTRAINT PK_Categorias PRIMARY KEY (cat_id),
    CONSTRAINT UQ_Categorias_nombre UNIQUE (cat_nombre)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS Proyectos (
    pro_id       INT          NOT NULL AUTO_INCREMENT,
    pro_nombre   VARCHAR(150) NOT NULL,
    pro_cat      INT          NOT NULL,
    -- 1 = el proyecto se carga por ticket GLPI: tiene tareas (cada una con su GLPI) y las horas van siempre contra una tarea.
    -- 0 = el proyecto no tiene tareas: las horas se cargan directo contra el proyecto.
    pro_usa_glpi BOOLEAN      NOT NULL DEFAULT 0,
    pro_activo   BOOLEAN      NOT NULL DEFAULT 1,
    CONSTRAINT PK_Proyectos PRIMARY KEY (pro_id),
    CONSTRAINT UQ_Proyectos_nombre UNIQUE (pro_nombre),
    CONSTRAINT FK_Proyectos_Categorias FOREIGN KEY (pro_cat) REFERENCES Categorias (cat_id)
) ENGINE = InnoDB;

-- Una tarea es un ticket GLPI: tar_glpi es obligatorio. Solo existen tareas en proyectos con pro_usa_glpi = 1
-- (se valida en el backend, no en la base).
CREATE TABLE IF NOT EXISTS Tareas (
    tar_id      INT          NOT NULL AUTO_INCREMENT,
    tar_pro     INT          NOT NULL,
    tar_nombre  VARCHAR(200) NOT NULL,
    tar_glpi    INT          NOT NULL,
    tar_activo  BOOLEAN      NOT NULL DEFAULT 1,
    CONSTRAINT PK_Tareas PRIMARY KEY (tar_id),
    CONSTRAINT FK_Tareas_Proyectos FOREIGN KEY (tar_pro) REFERENCES Proyectos (pro_id),
    CONSTRAINT CK_Tareas_glpi CHECK (tar_glpi > 0),
    -- Un ticket aparece una sola vez por proyecto (activo o dado de baja).
    CONSTRAINT UQ_Tareas_pro_glpi UNIQUE (tar_pro, tar_glpi),
    -- Soporte para la FK compuesta desde Tiempo (consistencia Proyecto-Tarea).
    CONSTRAINT UQ_Tareas_id_pro UNIQUE (tar_id, tar_pro)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS Tiempo (
    tie_id         INT          NOT NULL AUTO_INCREMENT,
    tie_fecha      DATE         NOT NULL,
    tie_usu        INT          NOT NULL,
    tie_pro        INT          NOT NULL,
    tie_tar        INT          NULL,
    tie_duracion   DECIMAL(4,2) NOT NULL,
    -- Solo para la unicidad de la celda: MariaDB no considera iguales dos NULL en un índice UNIQUE.
    tie_tar_clave  INT AS (IFNULL(tie_tar, 0)) PERSISTENT,
    CONSTRAINT PK_Tiempo PRIMARY KEY (tie_id),
    CONSTRAINT FK_Tiempo_Usuarios  FOREIGN KEY (tie_usu) REFERENCES Usuarios (usu_id),
    CONSTRAINT FK_Tiempo_Proyectos FOREIGN KEY (tie_pro) REFERENCES Proyectos (pro_id),
    -- Si tie_tar tiene valor, la tarea debe pertenecer a tie_pro. Con tie_tar NULL la FK no se evalúa.
    CONSTRAINT FK_Tiempo_Tareas FOREIGN KEY (tie_tar, tie_pro) REFERENCES Tareas (tar_id, tar_pro),
    -- Módulos de 30 minutos: 0.5, 1.0, 1.5 ... 24.0.
    CONSTRAINT CK_Tiempo_duracion CHECK (tie_duracion > 0 AND tie_duracion <= 24 AND MOD(tie_duracion, 0.5) = 0),
    -- Una celda de la grilla = (usuario, proyecto, tarea, fecha).
    CONSTRAINT UQ_Tiempo_celda UNIQUE (tie_usu, tie_pro, tie_tar_clave, tie_fecha),
    INDEX IX_Tiempo_fecha (tie_fecha)
) ENGINE = InnoDB;
