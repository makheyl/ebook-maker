import { defineMotion, num } from '../motion';

/** Grows (or shrinks) with a little overshoot, and stays that size. */
export const grow = defineMotion({
  id: 'grow',
  label: 'Grow / shrink',
  kind: 'emphasis',
  holdEnd: true,
  defaults: { duration: 800, delay: 0, easing: 'linear', params: { scale: 1.3 } },
  params: [
    { key: 'scale', label: 'Size', type: 'number', min: 0.4, max: 2.5, step: 0.05, unit: '×' },
  ],
  tracks: (ctx) => {
    const s = num(ctx.params, 'scale', 1.3);
    const over = 1 + (s - 1) * 1.12;
    return {
      element: [
        { offset: 0, scaleX: 1, scaleY: 1, easing: 'easeOut' },
        { offset: 0.7, scaleX: over, scaleY: over, easing: 'easeInOut' },
        { offset: 1, scaleX: s, scaleY: s },
      ],
    };
  },
});
