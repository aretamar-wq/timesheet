import 'dotenv/config';

function texto(nombre: string, porDefecto?: string): string {
  const valor = process.env[nombre]?.trim();
  if (valor) return valor;
  if (porDefecto !== undefined) return porDefecto;
  throw new Error(`Falta configurar la variable de entorno ${nombre} (ver .env.example).`);
}

function entero(nombre: string, porDefecto: number): number {
  const valor = Number(process.env[nombre]);
  return Number.isInteger(valor) && valor > 0 ? valor : porDefecto;
}

function booleano(nombre: string, porDefecto: boolean): boolean {
  const valor = process.env[nombre]?.trim().toLowerCase();
  if (!valor) return porDefecto;
  return valor === 'true' || valor === '1' || valor === 'si';
}

/** "bv.voii.com.ar" → "DC=bv,DC=voii,DC=com,DC=ar" */
function baseDnDe(dominio: string): string {
  return dominio.split('.').map((parte) => `DC=${parte}`).join(',');
}

const produccion = texto('NODE_ENV', 'development') === 'production';
const dominio = texto('AD_DOMINIO', 'bv.voii.com.ar');
const modoAd = texto('AD_MODO', 'real');

if (modoAd !== 'real' && modoAd !== 'simulado') {
  throw new Error('AD_MODO debe ser "real" o "simulado".');
}
if (modoAd === 'simulado' && produccion) {
  throw new Error('AD_MODO=simulado no está permitido con NODE_ENV=production.');
}

const secreto = texto('SESION_SECRETO', produccion ? undefined : 'solo-desarrollo-no-usar-en-produccion');
if (produccion && secreto.length < 32) {
  throw new Error('SESION_SECRETO debe tener al menos 32 caracteres.');
}

// Conexión al Domain Controller: servidor, puerto y SSL por separado (igual que ApiCore).
// AD_URL, si está, tiene prioridad (compatibilidad con instalaciones anteriores).
const adServidor = texto('AD_SERVIDOR', dominio);
const adUsaSsl = booleano('AD_USA_SSL', false);
const adPuerto = entero('AD_PUERTO', adUsaSsl ? 636 : 389);
const adUrl = texto('AD_URL', `${adUsaSsl ? 'ldaps' : 'ldap'}://${adServidor}:${adPuerto}`);

export const config = {
  produccion,
  host: texto('HOST', '127.0.0.1'),
  puerto: entero('PORT', 3000),
  appNombre: texto('APP_NOMBRE', 'Cocos Bank Timesheet'),
  db: {
    host: texto('DB_HOST', '127.0.0.1'),
    puerto: entero('DB_PORT', 3306),
    nombre: texto('DB_NAME', 'timesheet'),
    usuario: texto('DB_USER', 'timesheet_app'),
    password: texto('DB_PASSWORD', ''),
  },
  sesion: {
    secreto,
    horas: entero('SESION_HORAS', 8),
    cookieSegura: booleano('COOKIE_SEGURA', produccion),
  },
  ad: {
    modo: modoAd as 'real' | 'simulado',
    dominio,
    url: adUrl,
    startTls: booleano('AD_STARTTLS', true),
    tlsVerificar: booleano('AD_TLS_VERIFICAR', true),
    baseDn: texto('AD_BASE_DN', baseDnDe(dominio)),
    bindUsuario: texto('AD_BIND_USUARIO', ''),
    bindPassword: texto('AD_BIND_PASSWORD', ''),
  },
};
