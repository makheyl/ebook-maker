import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Read from disk: Vitest stubs CSS imports.
const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');

/** Hex tokens of one theme block (`:root {…}` or `.dark {…}`). */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6}(?:[0-9a-f]{2})?);/gi)) {
    out[name!] = value!.toLowerCase();
  }
  return out;
}

type Rgba = [number, number, number, number];
const parse = (hex: string): Rgba => {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return [n(1), n(3), n(5), hex.length > 7 ? n(7) / 255 : 1];
};
/** `top` painted over an opaque `bottom`. */
const over = (top: Rgba, bottom: Rgba): Rgba => {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i]! * a + bottom[i]! * (1 - a)).concat(1) as Rgba;
};
const luminance = ([r, g, b]: Rgba) => {
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a: Rgba, b: Rgba) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

const light = tokens(':root');
const dark = { ...light, ...tokens('.dark') };

describe.each([
  ['light', light],
  ['dark', dark],
])('the %s theme is legible', (_, t) => {
  const c = (name: string) => parse(t[name]!);
  const bg = c('background');
  const glass = over(c('glass-strong'), bg);
  const panel = over(c('glass'), bg);

  it('body text on the page, on panels and on floating glass', () => {
    expect(contrast(c('foreground'), bg)).toBeGreaterThanOrEqual(7);
    expect(contrast(c('foreground'), panel)).toBeGreaterThanOrEqual(7);
    expect(contrast(c('foreground'), glass)).toBeGreaterThanOrEqual(7);
  });

  it('secondary text (AA)', () => {
    expect(contrast(c('muted-foreground'), bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c('muted-foreground'), panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c('muted-foreground'), glass)).toBeGreaterThanOrEqual(4.5);
  });

  it('primary buttons and accents (AA)', () => {
    expect(contrast(c('primary-foreground'), c('primary'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c('accent-foreground'), c('accent'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c('secondary-foreground'), c('secondary'))).toBeGreaterThanOrEqual(4.5);
  });

  it('focus rings, selection and guides stand out (3:1 for UI)', () => {
    expect(contrast(c('ring'), bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(c('signal'), parse('#ffffff'))).toBeGreaterThanOrEqual(3);
    // Selection outlines are drawn on the (usually white) page.
    expect(contrast(c('selection'), parse('#ffffff'))).toBeGreaterThanOrEqual(3);
  });
});
