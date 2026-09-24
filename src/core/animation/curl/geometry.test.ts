import { describe, expect, it } from 'vitest';
import {
  clampCorner,
  cornerAt,
  curlFrame,
  foldGradient,
  POLY_POINTS,
  progressOf,
  type Pt,
} from './geometry';

const size = { width: 800, height: 600 };
const apply = (m: readonly number[], p: Pt) => ({
  x: m[0]! * p.x + m[2]! * p.y + m[4]!,
  y: m[1]! * p.x + m[3]! * p.y + m[5]!,
});

describe('page curl geometry', () => {
  it('folds along the perpendicular bisector of the corner and the drag point', () => {
    const f = curlFrame(size, { x: 600, y: 600 });
    // Dragging straight left by 200: a vertical fold at x = 700.
    expect(f.foldPoint).toEqual({ x: 700, y: 600 });
    expect(f.normal.x).toBeCloseTo(1, 6);
    expect(f.normal.y).toBeCloseTo(0, 6);
    expect(f.lifted.map((p) => p.x).every((x) => x >= 700)).toBe(true);
    expect(f.front.map((p) => p.x).every((x) => x <= 700)).toBe(true);
    // The flap is the lifted strip mirrored onto the front: x 700–800 → 600–700.
    expect(apply(f.mirror, { x: 800, y: 600 })).toEqual({ x: 600, y: 600 });
    expect(apply(f.mirror, { x: 700, y: 0 })).toEqual({ x: 700, y: 0 });
    expect(f.progress).toBeCloseTo(0.125, 6);
  });

  it('the mirror always sends the corner to the drag point', () => {
    for (const p of [
      { x: 500, y: 450 },
      { x: 100, y: 500 },
      { x: -300, y: 560 },
    ]) {
      const f = curlFrame(size, p);
      const c = apply(f.mirror, { x: 800, y: 600 });
      expect(c.x).toBeCloseTo(f.corner.x, 1);
      expect(c.y).toBeCloseTo(f.corner.y, 1);
    }
  });

  it('keeps a constant number of points, whatever the fold crosses', () => {
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const f = curlFrame(size, cornerAt(size, t));
      expect(f.front).toHaveLength(POLY_POINTS);
      expect(f.lifted).toHaveLength(POLY_POINTS);
    }
    const flat = curlFrame(size, { x: 800, y: 600 });
    expect(flat.lifted).toHaveLength(POLY_POINTS);
    expect(flat.progress).toBe(0);
  });

  it('clamps the corner so the page never tears from its spine', () => {
    const far = clampCorner(size, { x: 2000, y: -2000 });
    expect(Math.hypot(far.x, far.y - 600)).toBeLessThanOrEqual(800.001);
    expect(Math.hypot(far.x, far.y)).toBeLessThanOrEqual(1000.001);
    expect(clampCorner(size, { x: 400, y: 900 }).y).toBe(600);
    expect(clampCorner(size, { x: 500, y: 500 })).toEqual({ x: 500, y: 500 });
  });

  it('the automatic path sweeps from rest to turned over, lifting on the way', () => {
    expect(cornerAt(size, 0)).toEqual({ x: 800, y: 600 });
    const end = cornerAt(size, 1);
    expect(end.x).toBeCloseTo(-800, 6);
    expect(end.y).toBeCloseTo(600, 6);
    const mid = cornerAt(size, 0.5);
    expect(mid.y).toBeLessThan(600);
    let last = -1;
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const p = progressOf(size, cornerAt(size, t));
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    expect(last).toBeCloseTo(1, 6);
  });

  it('places gradient stops relative to the fold', () => {
    const f = curlFrame(size, { x: 600, y: 600 });
    // Normal points right: a 90deg gradient across the 800px width; the fold is at 700px.
    expect(
      foldGradient(size, f, [
        [0, 'black'],
        [20, 'transparent'],
      ]),
    ).toBe('linear-gradient(90deg, black 700px, transparent 720px)');
  });
});
