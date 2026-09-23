import { defineMotion, num } from '../motion';
import { stripKeyframes } from '../warp';
import { intensityParam, squash } from './helpers';

/** A wobbly jelly jiggle that settles down — the top wobbles most, the feet stay put. */
export const jelly = defineMotion({
  id: 'jelly',
  label: 'Jelly wobble',
  kind: 'emphasis',
  warp: true,
  defaults: { duration: 1200, delay: 0, easing: 'linear', params: { intensity: 1 } },
  params: [intensityParam],
  tracks: (ctx) => {
    const k = num(ctx.params, 'intensity', 1);
    const amplitude = ctx.element.width * 0.07 * k;
    const bends = [0, 1, -0.8, 0.55, -0.35, 0.18, -0.06, 0];
    return {
      element: [
        { offset: 0, scaleX: 1, scaleY: 1, easing: 'easeOut' },
        { offset: 0.12, ...squash(0.06 * k), easing: 'easeInOut' },
        { offset: 0.4, scaleX: 1, scaleY: 1 },
        { offset: 1, scaleX: 1, scaleY: 1 },
      ],
      extra: [
        {
          target: 'strips',
          keyframes: [],
          composite: 'add',
          perTarget: stripKeyframes(
            ctx.element.height,
            ctx.pivot?.y ?? 1,
            amplitude,
            bends.map((sway, i) => ({ offset: i / (bends.length - 1), sway, easing: 'easeInOut' })),
          ),
        },
      ],
    };
  },
});
