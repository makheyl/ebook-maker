import { defineMotion, num } from '../motion';
import { intensityParam, squash, stretch } from './helpers';

/** A ticklish wiggle — the default reaction when the reader taps the character. */
export const wiggle = defineMotion({
  id: 'wiggle',
  label: 'Wiggle (tickle)',
  kind: 'emphasis',
  defaults: { duration: 800, delay: 0, easing: 'linear', params: { intensity: 1 } },
  params: [intensityParam],
  tracks: (ctx) => {
    const k = num(ctx.params, 'intensity', 1);
    const a = 6 * k;
    const seq = [a, -a, a * 0.85, -a * 0.7, a * 0.5, -a * 0.3];
    return {
      element: [
        { offset: 0, rotate: 0, easing: 'easeInOut' },
        ...seq.map((rotate, i) => ({
          offset: (i + 1) / (seq.length + 1),
          rotate,
          ...(i % 2 ? squash(0.04 * k) : stretch(0.04 * k)),
          easing: 'easeInOut',
        })),
        { offset: 1, rotate: 0, scaleX: 1, scaleY: 1 },
      ],
    };
  },
});
