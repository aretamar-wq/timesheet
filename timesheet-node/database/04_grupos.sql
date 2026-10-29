/*
    Sistema de Carga de Horas - Área Aplicaciones
    04_grupos.sql - Grupos de usuarios (para agrupar personas y filtrar reportes) y su patente ABM_GRUPOS.

    Ejecutar con:  mariadb -u root -p < 04_grupos.sql
    Es idempotente: se puede correr más de una vez. En una instalación nueva ya está incluido por 01/02,
    pero correrlo igual no hace daño. En una instalación existente es el único script que hay que correr.

    Un grupo reúne usuarios; un usuario puede estar en varios grupos (relación muchos a muchos).
    Los grupos no dan permisos (eso lo hacen las Familias): solo sirven para agrupar y filtrar reportes.
*/
USE timesheet;
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_520_ci;

CREATE TABLE IF NOT EXISTS Grupos (
    gru_id      INT          NOT NULL AUTO_INCREMENT,
    gru_nombre  VARCHAR(100) NOT NULL,
    gru_activo  BOOLEAN      NOT NULL DEFAULT 1,
    CONSTRAINT PK_Grupos PRIMARY KEY (gru_id),
    CONSTRAINT UQ_Grupos_nombre UNIQUE (gru_nombre)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS Grupo_Usuario (
    gru_id  INT NOT NULL,
    usu_id  INT NOT NULL,
    CONSTRAINT PK_Grupo_Usuario PRIMARY KEY (gru_id, usu_id),
    CONSTRAINT FK_Grupo_Usuario_Grupos   FOREIGN KEY (gru_id) REFERENCES Grupos (gru_id),
    CONSTRAINT FK_Grupo_Usuario_Usuarios FOREIGN KEY (usu_id) REFERENCES Usuarios (usu_id),
    INDEX IX_Grupo_Usuario_usuario (usu_id)
) ENGINE = InnoDB;

START TRANSACTION;

/* Patente nueva (id fijo 9: el código la referencia por nombre) */
INSERT INTO Patentes (pat_id, pat_nombre, pat_descripcion)
SELECT 9, 'ABM_GRUPOS', 'Administración de grupos de usuarios'
WHERE NOT EXISTS (SELECT 1 FROM Patentes WHERE pat_nombre = 'ABM_GRUPOS');

/* La familia Administrador (id 2) recibe la patente nueva */
INSERT INTO Familia_Patente (fam_id, pat_id)
SELECT 2, p.pat_id
FROM Patentes p
WHERE p.pat_nombre = 'ABM_GRUPOS'
  AND EXISTS (SELECT 1 FROM Familias WHERE fam_id = 2)
  AND NOT EXISTS (SELECT 1 FROM Familia_Patente fp WHERE fp.fam_id = 2 AND fp.pat_id = p.pat_id);

COMMIT;
