import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* FORGED storefront — single-page React app (react-router).
   One HTML shell; every route is a React component. Build → dist/,
   which the Express backend serves at / with an SPA history fallback. */
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:5000',
      '/uploads': 'http://127.0.0.1:5000',
      '/socket.io': { target: 'http://127.0.0.1:5000', ws: true }, /* Phase 7 — realtime gateway in dev */
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
