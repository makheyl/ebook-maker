import { stripKeyframes } from '../warp';
import type { IdleMotion } from './types';

/**
 * Sways like a plant in the breeze: the top bends side to side while the feet stay planted.
 * A warp motion: the character is drawn as strips, each sheared a little more toward the top.
 */
export const sway: IdleMotion = {
  id: 'sway',
  label: 'Sway',
  duration: 3000,
  warp: true,
  build: ({ element, intensity, pivot }) => {
    const amplitude = element.width * 0.045 * intensity;
    return {
      extra: [
        {
          target: 'strips',
          keyframes: [],
          perTarget: stripKeyframes(element.height, pivot.y, amplitude, [
            { offset: 0, sway: 0, easing: 'easeInOut' },
            { offset: 0.25, sway: 1, easing: 'easeInOut' },
            { offset: 0.5, sway: 0, easing: 'easeInOut' },
            { offset: 0.75, sway: -1, easing: 'easeInOut' },
            { offset: 1, sway: 0 },
          ]),
        },
      ],
    };
  },
};
