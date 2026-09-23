import { defineMotion, num, str, type MotionFrame } from '../motion';
import {
  baseFlip,
  clampInt,
  faceToward,
  hopFrames,
  offPage,
  tidy,
  toSideParam,
  type Side,
} from './helpers';

/** Hops off the side of the page. */
export const hopOut = defineMotion({
  id: 'hopOut',
  label: 'Hop out',
  kind: 'exit',
  defaults: { duration: 1600, delay: 0, easing: 'linear', params: { to: 'right', hops: 3 } },
  params: [toSideParam, { key: 'hops', label: 'Hops', type: 'number', min: 1, max: 5, step: 1 }],
  tracks: (ctx) => {
    const to = str(ctx.params, 'to', 'right') as Side;
    const hops = clampInt(num(ctx.params, 'hops', 3), 1, 5);
    const height = ctx.element.height * 0.22;
    const distance = offPage(ctx, to);
    const start = 0.08;
    const frames: MotionFrame[] = [{ offset: 0 }];
    for (let h = 0; h < hops; h++) {
      const t0 = start + (h / hops) * (1 - start);
      const t1 = start + ((h + 1) / hops) * (1 - start);
      frames.push(...hopFrames(t0, t1, height, (distance * h) / hops, (distance * (h + 1)) / hops));
    }
    return {
      element: tidy(frames),
      face: [
        { offset: 0, scaleX: baseFlip(ctx), easing: 'easeInOut' },
        { offset: start, scaleX: faceToward(ctx, to) },
        { offset: 1, scaleX: faceToward(ctx, to) },
      ],
    };
  },
});
