import { defineMotion, num, str, type MotionFrame } from '../motion';
import {
  baseFlip,
  clampInt,
  faceToward,
  fromSideParam,
  hopFrames,
  intensityParam,
  offPage,
  tidy,
  type Side,
} from './helpers';

/** Hops in from the side in a few arcs, squashing on each landing. */
export const hopIn = defineMotion({
  id: 'hopIn',
  label: 'Hop in',
  kind: 'entrance',
  defaults: {
    duration: 1600,
    delay: 0,
    easing: 'linear',
    params: { from: 'left', hops: 3, intensity: 1 },
  },
  params: [
    fromSideParam,
    { key: 'hops', label: 'Hops', type: 'number', min: 1, max: 5, step: 1 },
    intensityParam,
  ],
  tracks: (ctx) => {
    const from = str(ctx.params, 'from', 'left') as Side;
    const hops = clampInt(num(ctx.params, 'hops', 3), 1, 5);
    const height = ctx.element.height * 0.22 * num(ctx.params, 'intensity', 1);
    const distance = offPage(ctx, from);
    const end = 0.94;
    const frames: MotionFrame[] = [];
    for (let h = 0; h < hops; h++) {
      frames.push(
        ...hopFrames(
          (h / hops) * end,
          ((h + 1) / hops) * end,
          height,
          distance * (1 - h / hops),
          distance * (1 - (h + 1) / hops),
        ),
      );
    }
    frames.push({ offset: 1 });
    const toward: Side = from === 'left' ? 'right' : 'left';
    return {
      element: tidy(frames),
      face: [
        { offset: 0, scaleX: faceToward(ctx, toward) },
        { offset: end, scaleX: faceToward(ctx, toward), easing: 'easeInOut' },
        { offset: 1, scaleX: baseFlip(ctx) },
      ],
    };
  },
});
