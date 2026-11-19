import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const backendEnvDir = fileURLToPath(new URL('../backend/', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, backendEnvDir, ['PORT', 'API_PROXY_TARGET']);
  const target = (env.API_PROXY_TARGET || `http://127.0.0.1:${env.PORT || 5000}`).replace(/\/+$/, '');

  return {
    plugins: [react({ jsxRuntime: 'automatic' })],
    base: '/',
    server: {
      port: 5173,
      strictPort: true,
      hmr: { clientPort: 5173 },
      proxy: {
        '/api': target,
        '/uploads': target,
        '/socket.io': { target, ws: true },
      },
    },
    build: { outDir: 'dist', emptyOutDir: true },
  };
});
