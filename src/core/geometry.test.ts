import { describe, expect, it } from 'vitest';
import { alignDeltas, distributeDeltas, rotatedBounds } from './geometry';

const el = (id: string, x: number, y: number, width = 10, height = 10, rotation = 0) => ({
  id,
  x,
  y,
  width,
  height,
  rotation,
});

describe('geometry', () => {
  it('computes rotated bounds', () => {
    const b = rotatedBounds(el('a', 0, 0, 100, 20, 90));
    expect(b.width).toBeCloseTo(20);
    expect(b.height).toBeCloseTo(100);
    expect(b.x).toBeCloseTo(40);
    expect(b.y).toBeCloseTo(-40);
  });

  it('aligns to a target rect', () => {
    const page = { x: 0, y: 0, width: 200, height: 100 };
    expect(alignDeltas([el('a', 50, 50)], 'right', page)).toEqual([{ id: 'a', dx: 140, dy: 0 }]);
    expect(alignDeltas([el('a', 50, 50)], 'middle', page)).toEqual([{ id: 'a', dx: 0, dy: -5 }]);
    expect(alignDeltas([el('a', 50, 50)], 'center', page)).toEqual([{ id: 'a', dx: 45, dy: 0 }]);
  });

  it('distributes evenly between the outermost elements', () => {
    const deltas = distributeDeltas([el('a', 0, 0), el('c', 90, 0), el('b', 20, 0)], 'horizontal');
    expect(deltas.find((d) => d.id === 'b')!.dx).toBe(25);
    expect(deltas.find((d) => d.id === 'a')!.dx).toBe(0);
    expect(deltas.find((d) => d.id === 'c')!.dx).toBe(0);
  });
});
