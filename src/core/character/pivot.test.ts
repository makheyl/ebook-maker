import { describe, expect, it } from 'vitest';
import { defaultPivot, pivotToLocal } from './pivot';

const asset = { width: 1000, height: 1000 };
const el = (over: Partial<Parameters<typeof pivotToLocal>[1]> = {}) => ({
  crop: { x: 0, y: 0, width: 1, height: 1 },
  width: 200,
  height: 200,
  flipX: false,
  flipY: false,
  ...over,
});

describe('pivotToLocal', () => {
  it('is the same point when the whole image fills the box', () => {
    expect(pivotToLocal(asset, el(), { x: 0.5, y: 0.9 })).toEqual({ x: 0.5, y: 0.9 });
  });

  it('follows the crop', () => {
    // Showing only the bottom half: the feet at y=0.9 of the art are at 0.8 of the box.
    const local = pivotToLocal(
      asset,
      el({ crop: { x: 0, y: 0.5, width: 1, height: 0.5 }, height: 100 }),
      {
        x: 0.5,
        y: 0.9,
      },
    );
    expect(local.x).toBeCloseTo(0.5);
    expect(local.y).toBeCloseTo(0.8);
  });

  it('mirrors with flips', () => {
    expect(pivotToLocal(asset, el({ flipX: true }), { x: 0.2, y: 1 })).toEqual({ x: 0.8, y: 1 });
  });
});

describe('defaultPivot', () => {
  it('puts the pivot at the bottom centre of the visible pixels', () => {
    expect(defaultPivot({ x: 0.2, y: 0.1, width: 0.4, height: 0.8 })).toEqual({ x: 0.4, y: 0.9 });
    expect(defaultPivot()).toEqual({ x: 0.5, y: 1 });
  });
});
