import { defineMotion, num } from '../motion';

/** Rocks side to side on its feet — a friendly whole-body wave. */
export const wave = defineMotion({
  id: 'wave',
  label: 'Wave',
  kind: 'emphasis',
  defaults: { duration: 1400, delay: 0, easing: 'linear', params: { angle: 8 } },
  params: [{ key: 'angle', label: 'Angle', type: 'number', min: 2, max: 25, step: 1, unit: '°' }],
  tracks: (ctx) => {
    const a = num(ctx.params, 'angle', 8);
    const seq = [0, a, -0.8 * a, 0.8 * a, -0.5 * a, 0.3 * a, 0];
    return {
      element: seq.map((rotate, i) => ({
        offset: i / (seq.length - 1),
        rotate,
        easing: 'easeInOut',
      })),
    };
  },
});
