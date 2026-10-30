# Instalación en un servidor Linux

Guía para instalar Cocos Bank Timesheet en un servidor Linux sin Docker. Los ejemplos son para Ubuntu 24.04 o Debian 12. En RHEL o Rocky cambian el gestor de paquetes (`dnf`) y la carpeta de nginx (`conf.d`).

## Arquitectura

```
Navegador ──HTTP/HTTPS──► nginx :80/:443
                           ├─ /        → /opt/timesheet/frontend/dist  (React compilado)
                           └─ /api/*   → Node 127.0.0.1:3000           (systemd: timesheet-api)
                                           ├─ MariaDB (localhost:3306, base timesheet)
                                           └─ Active Directory (LDAP/LDAPS)
```

## Qué pedirle a IT

1. **Servidor Linux** con acceso a internet durante la instalación (para bajar paquetes).
2. **Nombre DNS** para el sitio, por ejemplo `timesheet.bv.voii.com.ar`.
3. **Certificado HTTPS** para ese nombre, emitido por la CA interna, con la cadena completa y la clave privada. Es imprescindible porque el login recibe la contraseña de red.
4. **Acceso de red del servidor al controlador de dominio**: puerto 636 (LDAPS) o 389 con STARTTLS.
5. **Cuenta de servicio de AD**, solo lectura, con contraseña que no venza. La usan el login y el ABM de Usuarios ("Verificar en AD"). En Windows esa consulta la hacía la cuenta de máquina, pero un servidor Linux no está unido al dominio.
6. **Certificado de la CA interna** en formato PEM, si el certificado del controlador de dominio lo emite esa CA.
7. **Inclusión de `/var/backups/timesheet` en el backup** de IT, o una copia a otro equipo.

## 1. Paquetes

```sh
sudo apt update
sudo apt install -y nginx mariadb-server curl

# Node.js 22 LTS (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs
node --version   # v22.x

sudo mariadb-secure-installation
```

## 2. Usuario y archivos

```sh
sudo useradd --system --home /opt/timesheet --shell /usr/sbin/nologin timesheet
sudo mkdir -p /opt/timesheet
# Copiar el contenido del proyecto (database/, backend/, frontend/, deploy/) a /opt/timesheet,
# por ejemplo con scp, o con git clone si está en un repositorio.
sudo chown -R timesheet:timesheet /opt/timesheet
```

## 3. Base de datos

Antes de ejecutar los scripts:

- En `database/02_seed.sql`, revisar `@AdminLogin`: es el usuario de red del administrador inicial.
- En `database/03_usuario_app.sql`, cambiar la contraseña.

```sh
cd /opt/timesheet/database
sudo mariadb < 01_schema.sql
sudo mariadb < 02_seed.sql
sudo mariadb < 03_usuario_app.sql
sudo mariadb < 04_feriados.sql
```

## 4. Backend

```sh
cd /opt/timesheet/backend
sudo -u timesheet cp .env.example .env
sudo -u timesheet chmod 600 .env
sudo -u timesheet nano .env
```

Variables a completar en `.env`:

- `DB_PASSWORD`: la misma contraseña que se puso en `03_usuario_app.sql`.
- `SESION_SECRETO`: generarlo con:
  ```sh
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- `AD_URL`, `AD_STARTTLS`, `AD_BIND_USUARIO` y `AD_BIND_PASSWORD`: los datos que pase IT.
- `COOKIE_SEGURA=true`: recién cuando el sitio funcione por HTTPS.

Compilar e instalar el servicio:

```sh
sudo -u timesheet npm ci
sudo -u timesheet npm run build
sudo -u timesheet npm prune --omit=dev

sudo cp /opt/timesheet/deploy/systemd/timesheet-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now timesheet-api
sudo systemctl status timesheet-api
journalctl -u timesheet-api -f       # logs
```

Si la CA interna no es reconocida, el login dice "No se pudo contactar al servidor de dominio" y en el log aparece `ECONNRESET` o `unable to get local issuer certificate`. Para resolverlo:

1. Copiar `deploy/certificados/ca-interna.pem` a `/etc/ssl/certs/ca-interna.pem`. Es la cadena `bv-SCA-PW-CA` → `RCA-PW-CA`, que vence el 20/08/2029. Cuando IT renueve la CA, hay que reemplazar el archivo.
2. Descomentar `NODE_EXTRA_CA_CERTS` en el `.service`.
3. Ejecutar `sudo systemctl daemon-reload && sudo systemctl restart timesheet-api`.

Para verificar:

```sh
openssl s_client -connect bv.voii.com.ar:389 -starttls ldap -brief -CAfile /etc/ssl/certs/ca-interna.pem -verify_hostname bv.voii.com.ar </dev/null
```

## 5. Frontend

```sh
cd /opt/timesheet/frontend
sudo -u timesheet npm ci
sudo -u timesheet npm run build      # genera dist/
```

## 6. nginx

```sh
sudo cp /opt/timesheet/deploy/nginx/timesheet-app.conf /etc/nginx/snippets/
sudo cp /opt/timesheet/deploy/nginx/timesheet.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/timesheet.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
# Editar server_name en timesheet.conf.
sudo nginx -t && sudo systemctl reload nginx
```

Para activar HTTPS:

1. Copiar el certificado y la clave a `/etc/nginx/ssl/`. La clave con `chmod 600`.
2. Descomentar el bloque `443` en `timesheet.conf`.
3. En el bloque `80`, dejar solo la redirección.
4. Poner `COOKIE_SEGURA=true` en `.env`.
5. Ejecutar `sudo systemctl restart timesheet-api` y `sudo systemctl reload nginx`.

## 7. Backup

```sh
sudo cp /opt/timesheet/deploy/backup/backup-timesheet.sh /usr/local/bin/
sudo chmod 750 /usr/local/bin/backup-timesheet.sh
sudo crontab -e      # agregar:  30 2 * * * /usr/local/bin/backup-timesheet.sh
```

Para restaurar un backup:

```sh
gunzip -c timesheet_AAAAMMDD_HHMM.sql.gz | sudo mariadb
```

## Actualizar a una versión nueva

```sh
# copiar los archivos nuevos a /opt/timesheet (sin pisar backend/.env)
cd /opt/timesheet/backend && sudo -u timesheet npm ci && sudo -u timesheet npm run build && sudo -u timesheet npm prune --omit=dev
cd /opt/timesheet/frontend && sudo -u timesheet npm ci && sudo -u timesheet npm run build
sudo systemctl restart timesheet-api
```

Los cambios de schema van en scripts nuevos en `database/` (por ejemplo `04_...sql`) y se ejecutan con `sudo mariadb < 04_...sql`.

## Desarrollo local (Windows o Linux)

1. Instalar Node 22 y MariaDB, y correr los scripts de `database/`.
2. Backend:
   - Copiar `.env.example` como `.env` con `NODE_ENV=development`.
   - Si no hay acceso a AD, usar `AD_MODO=simulado`, que acepta cualquier contraseña. Solo funciona en desarrollo.
   - Ejecutar `npm install` y `npm run dev`.
3. Frontend: `npm install` y `npm run dev`. Abre en http://localhost:5173 y Vite deriva `/api` al backend.
