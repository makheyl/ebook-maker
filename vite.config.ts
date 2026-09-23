/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { playerBundlePlugin } from './vite-plugins/player-bundle.ts';

export default defineConfig({
  // Relative base so the built app also works from a sub-path or file host.
  base: './',
  plugins: [react(), tailwindcss(), playerBundlePlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}', 'vite-plugins/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    restoreMocks: true,
  },
});
