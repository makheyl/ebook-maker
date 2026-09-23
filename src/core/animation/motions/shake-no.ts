import { defineMotion, num } from '../motion';
import { intensityParam } from './helpers';

/** A quick "no, no, no" shake. */
export const shakeNo = defineMotion({
  id: 'shakeNo',
  label: 'Shake "no"',
  kind: 'emphasis',
  defaults: { duration: 900, delay: 0, easing: 'linear', params: { intensity: 1 } },
  params: [intensityParam],
  tracks: (ctx) => {
    const a = 4 * num(ctx.params, 'intensity', 1);
    const seq = [0, a, -a, a, -a, a * 0.6, -a * 0.4, 0];
    return {
      element: seq.map((rotate, i) => ({
        offset: i / (seq.length - 1),
        rotate,
        easing: 'easeInOut',
      })),
    };
  },
});
