import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En desarrollo, Vite sirve el frontend y deriva /api al backend (en producción eso lo hace nginx).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
});
