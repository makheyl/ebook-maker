// @vitest-environment node
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildPlayerBundle } from './player-bundle';

describe('player bundle', () => {
  it('builds the reader runtime in memory as a single IIFE', async () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const bundle = await buildPlayerBundle(root);
    expect(bundle.js.length).toBeGreaterThan(0);
    expect(bundle.js).not.toMatch(/\bimport\s*\(/);
    expect(bundle.js).not.toContain('react');
  }, 60_000);
});
