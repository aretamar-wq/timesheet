#!/bin/sh
# Cocos Bank Timesheet - backup diario de la base MariaDB.
# Copiar a /usr/local/bin/backup-timesheet.sh (chmod 750) y programarlo como root, por ejemplo con
#   crontab -e  →  30 2 * * * /usr/local/bin/backup-timesheet.sh
# Deja un .sql.gz por día en DESTINO y borra los de más de DIAS_RETENCION días.
# Copiar DESTINO a otro equipo (o pedir a IT que lo incluya en su backup): un backup en el mismo disco no
# protege contra la pérdida del servidor.

set -eu

DESTINO=/var/backups/timesheet
DIAS_RETENCION=30
ARCHIVO="$DESTINO/timesheet_$(date +%Y%m%d_%H%M).sql.gz"

mkdir -p "$DESTINO"
chmod 700 "$DESTINO"

# Como root, MariaDB autentica por socket (unix_socket): no hace falta contraseña.
mariadb-dump --single-transaction --routines --triggers --databases timesheet | gzip > "$ARCHIVO"

find "$DESTINO" -name 'timesheet_*.sql.gz' -mtime +"$DIAS_RETENCION" -delete
