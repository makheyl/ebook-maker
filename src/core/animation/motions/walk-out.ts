import { defineMotion, num, str, type MotionFrame } from '../motion';
import {
  baseFlip,
  clampInt,
  faceToward,
  offPage,
  stepsParam,
  toSideParam,
  type Side,
} from './helpers';

/** Walks off the page, bobbing on each step. */
export const walkOut = defineMotion({
  id: 'walkOut',
  label: 'Walk out',
  kind: 'exit',
  defaults: { duration: 1800, delay: 0, easing: 'linear', params: { to: 'right', steps: 4 } },
  params: [toSideParam, stepsParam],
  tracks: (ctx) => {
    const to = str(ctx.params, 'to', 'right') as Side;
    const steps = clampInt(num(ctx.params, 'steps', 4), 2, 8);
    const distance = offPage(ctx, to);
    const bob = ctx.element.height * 0.04;
    const start = 0.1;
    const n = steps * 2;
    const frames: MotionFrame[] = [{ offset: 0, x: 0, y: 0, rotate: 0 }];
    for (let k = 0; k <= n; k++) {
      const p = k / n;
      const up = k % 2 === 1;
      frames.push({
        offset: start + p * (1 - start),
        x: distance * p,
        y: up ? -bob : 0,
        rotate: up ? (k % 4 === 1 ? 2.5 : -2.5) : 0,
        easing: 'easeInOut',
      });
    }
    return {
      element: frames,
      face: [
        { offset: 0, scaleX: baseFlip(ctx), easing: 'easeInOut' },
        { offset: start, scaleX: faceToward(ctx, to) },
        { offset: 1, scaleX: faceToward(ctx, to) },
      ],
    };
  },
});
