/*
    Sistema de Carga de Horas - Área Aplicaciones
    04_feriados.sql - Tabla de feriados y patente ABM_FERIADOS (asignada a la familia Administrador).

    Ejecutar con:  mariadb -u root -p < 04_feriados.sql
    Es idempotente: se puede correr en una instalación nueva (después de 01 y 02) o en una existente.

    En la carga de horas, los feriados activos se muestran como los sábados y domingos (no bloquean la carga).
*/
USE timesheet;
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_520_ci;

CREATE TABLE IF NOT EXISTS Feriados (
    fer_id           INT          NOT NULL AUTO_INCREMENT,
    fer_fecha        DATE         NOT NULL,
    fer_descripcion  VARCHAR(100) NOT NULL,
    fer_activo       BOOLEAN      NOT NULL DEFAULT 1,
    CONSTRAINT PK_Feriados PRIMARY KEY (fer_id),
    -- Un feriado por día (activo o dado de baja: para volver a usar la fecha, se reactiva).
    CONSTRAINT UQ_Feriados_fecha UNIQUE (fer_fecha)
) ENGINE = InnoDB;

START TRANSACTION;

INSERT INTO Patentes (pat_id, pat_nombre, pat_descripcion)
SELECT 9, 'ABM_FERIADOS', 'Administración de feriados' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Patentes WHERE pat_id = 9);

INSERT INTO Familia_Patente (fam_id, pat_id)
SELECT 2, 9 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Familia_Patente WHERE fam_id = 2 AND pat_id = 9);

COMMIT;
