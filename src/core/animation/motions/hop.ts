import { defineMotion, num, type MotionFrame } from '../motion';
import { clampInt, hopFrames, intensityParam, tidy } from './helpers';

/** Hops in place: anticipation squash, stretch up, land with a squash. */
export const hop = defineMotion({
  id: 'hop',
  label: 'Hop',
  kind: 'emphasis',
  defaults: {
    duration: 900,
    delay: 0,
    easing: 'linear',
    params: { height: 0.35, count: 1, intensity: 1 },
  },
  params: [
    { key: 'height', label: 'Height', type: 'number', min: 0.05, max: 1, step: 0.05 },
    { key: 'count', label: 'Hops', type: 'number', min: 1, max: 5, step: 1 },
    intensityParam,
  ],
  tracks: (ctx) => {
    const count = clampInt(num(ctx.params, 'count', 1), 1, 5);
    const intensity = num(ctx.params, 'intensity', 1);
    const height = ctx.element.height * num(ctx.params, 'height', 0.35) * intensity;
    const frames: MotionFrame[] = [];
    for (let i = 0; i < count; i++) {
      frames.push(
        ...hopFrames(i / count, (i + 1) / count, height, 0, 0, 0.12 * Math.min(1.5, intensity)),
      );
    }
    return { element: tidy(frames) };
  },
});
