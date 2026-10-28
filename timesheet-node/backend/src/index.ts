import { crearApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';

const servidor = crearApp().listen(config.puerto, config.host, () => {
  console.log(`${config.appNombre} - API escuchando en http://${config.host}:${config.puerto}`);
  if (config.ad.modo === 'simulado') {
    console.warn('ATENCIÓN: AD_MODO=simulado, se acepta cualquier contraseña. Solo para desarrollo.');
  }
});

// systemd envía SIGTERM al detener o reiniciar el servicio.
function detener(): void {
  servidor.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}
process.on('SIGTERM', detener);
process.on('SIGINT', detener);
