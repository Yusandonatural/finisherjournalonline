import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'src/web',
  publicDir: resolve(import.meta.dirname, 'public'),
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, 'dist/client'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'src/web/index.html'),
        login: resolve(import.meta.dirname, 'src/web/login.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      '/auth': 'http://localhost:8787',
    },
  },
  test: { root: '.', include: ['src/**/*.test.ts'] },
} as any);
