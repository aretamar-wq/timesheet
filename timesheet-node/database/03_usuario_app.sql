/*
    Sistema de Carga de Horas - Área Aplicaciones
    03_usuario_app.sql - Usuario de MariaDB con el que se conecta el backend (solo lectura/escritura de datos).

    Ejecutar con:  mariadb -u root -p < 03_usuario_app.sql
    ANTES de ejecutarlo, cambiar la contraseña y ponerla también en backend/.env (DB_PASSWORD).
    El backend corre en el mismo servidor, por eso el usuario solo puede conectarse desde localhost.
*/
CREATE USER IF NOT EXISTS 'timesheet_app'@'localhost' IDENTIFIED BY 'CAMBIAR_ESTA_CLAVE';
GRANT SELECT, INSERT, UPDATE, DELETE ON timesheet.* TO 'timesheet_app'@'localhost';
FLUSH PRIVILEGES;
