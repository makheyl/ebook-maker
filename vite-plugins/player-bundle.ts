import path from 'node:path';
import { build, type Plugin } from 'vite';

/**
 * Exposes the compiled reader runtime (src/player) as strings:
 *
 *   import { playerJs, playerCss } from 'virtual:player-bundle';
 *
 * The exporter stitches these into the standalone HTML file. The player is built
 * in-memory with vite.player.config.ts (IIFE, no editor code). In dev the bundle
 * is rebuilt lazily whenever a file under src/core or src/player changes.
 */
const VIRTUAL_ID = 'virtual:player-bundle';
const RESOLVED_ID = '\0' + VIRTUAL_ID;
const WATCHED = /[\\/]src[\\/](core|player)[\\/]/;

export type PlayerBundle = { js: string; css: string };

export async function buildPlayerBundle(root: string): Promise<PlayerBundle> {
  const result = await build({
    root,
    configFile: path.resolve(root, 'vite.player.config.ts'),
    logLevel: 'warn',
    build: { write: false, emptyOutDir: false },
  });
  const outputs = Array.isArray(result) ? result : [result];
  let js = '';
  let css = '';
  for (const out of outputs) {
    if (!('output' in out)) continue;
    for (const item of out.output) {
      if (item.type === 'chunk') {
        js += item.code;
      } else if (item.fileName.endsWith('.css')) {
        css +=
          typeof item.source === 'string' ? item.source : new TextDecoder().decode(item.source);
      }
    }
  }
  if (!js) throw new Error('[player-bundle] player build produced no JavaScript');
  return { js, css };
}

export function playerBundlePlugin(): Plugin {
  let root = process.cwd();
  let cache: Promise<PlayerBundle> | null = null;

  return {
    name: 'folio:player-bundle',
    configResolved(config) {
      root = config.root;
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return undefined;
      cache ??= buildPlayerBundle(root);
      let bundle: PlayerBundle;
      try {
        bundle = await cache;
      } catch (err) {
        cache = null;
        throw err;
      }
      return [
        `export const playerJs = ${JSON.stringify(bundle.js)};`,
        `export const playerCss = ${JSON.stringify(bundle.css)};`,
      ].join('\n');
    },
    configureServer(server) {
      const invalidate = (file: string) => {
        if (!WATCHED.test(file)) return;
        cache = null;
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
      };
      server.watcher.on('change', invalidate);
      server.watcher.on('add', invalidate);
      server.watcher.on('unlink', invalidate);
    },
  };
}
