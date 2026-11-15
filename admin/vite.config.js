import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* FORGED admin — single-page React app mounted at /admin.
   One HTML shell + react-router (basename /admin). Build → dist/,
   which the Express backend serves at /admin with an SPA history fallback. */
export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  server: {
    port: 5174,
    proxy: { '/api': 'http://localhost:5000', '/uploads': 'http://localhost:5000', '/assets': 'http://localhost:5000' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
