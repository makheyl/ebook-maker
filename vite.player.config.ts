import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Builds the standalone reader runtime (src/player/main.ts) as a single IIFE +
 * one CSS file. It must never import editor/React code: it only depends on the
 * framework-agnostic modules in src/core.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  publicDir: false,
  build: {
    outDir: 'dist-player',
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: false,
    minify: true,
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL('./src/player/main.ts', import.meta.url)),
      name: 'FolioPlayer',
      formats: ['iife'],
      fileName: () => 'player.js',
      cssFileName: 'player',
    },
  },
});
