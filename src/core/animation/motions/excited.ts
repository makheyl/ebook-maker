import { defineMotion, num } from '../motion';
import { hopFrames, intensityParam, tidy } from './helpers';

/** Jumps for joy: two quick hops, then a happy wiggle. */
export const excited = defineMotion({
  id: 'excited',
  label: 'Jump for joy',
  kind: 'emphasis',
  defaults: { duration: 1400, delay: 0, easing: 'linear', params: { intensity: 1 } },
  params: [intensityParam],
  tracks: (ctx) => {
    const k = num(ctx.params, 'intensity', 1);
    const h = ctx.element.height * 0.2 * k;
    const a = 6 * k;
    return {
      element: tidy([
        ...hopFrames(0, 0.35, h),
        ...hopFrames(0.35, 0.7, h * 0.8),
        { offset: 0.76, rotate: a, easing: 'easeInOut' },
        { offset: 0.82, rotate: -a, easing: 'easeInOut' },
        { offset: 0.88, rotate: a * 0.7, easing: 'easeInOut' },
        { offset: 0.94, rotate: -a * 0.4, easing: 'easeInOut' },
        { offset: 1, rotate: 0 },
      ]),
    };
  },
});
