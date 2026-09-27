import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// デモ版（アーティファクト用）: 1つの HTML にまとめるため、分割せず1本の JS にする
export default defineConfig({
  root: 'src/demo',
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, 'dist/demo'),
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
