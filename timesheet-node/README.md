# Cocos Bank Timesheet

Sistema de carga de horas del área de Aplicaciones. Usa Node.js (Express + TypeScript), React, MariaDB y nginx sobre Linux.

- `CLAUDE.md`: reglas de negocio, modelo de datos y convenciones del código.
- `INSTALACION.md`: instalación en el servidor y desarrollo local.

Inicio rápido en desarrollo:

1. Correr los scripts de `database/` en MariaDB.
2. En `backend/`:
   - Copiar `.env.example` como `.env`, con `NODE_ENV=development` y, si no hay AD, `AD_MODO=simulado`.
   - Ejecutar `npm install` y `npm run dev`.
3. En `frontend/`: ejecutar `npm install` y `npm run dev`.
4. Abrir http://localhost:5173.
