import type { IdleMotion } from './types';

/** Gentle breathing: a small vertical stretch with volume-preserving width, feet planted. */
export const breathe: IdleMotion = {
  id: 'breathe',
  label: 'Breathe',
  duration: 3200,
  frames: ({ intensity }) => {
    const sy = 1 + 0.025 * intensity;
    const sx = 1 / Math.sqrt(sy);
    return [
      { offset: 0, scaleX: 1, scaleY: 1, easing: 'easeInOut' },
      { offset: 0.5, scaleX: sx, scaleY: sy, easing: 'easeInOut' },
      { offset: 1, scaleX: 1, scaleY: 1 },
    ];
  },
};
