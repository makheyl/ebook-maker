import { defineMotion, num, str, type MotionFrame } from '../motion';
import {
  baseFlip,
  clampInt,
  faceToward,
  fromSideParam,
  offPage,
  squash,
  stepsParam,
  type Side,
} from './helpers';

/** Walks in from the side of the page with a bob on every step, facing where it's going. */
export const walkIn = defineMotion({
  id: 'walkIn',
  label: 'Walk in',
  kind: 'entrance',
  defaults: { duration: 1800, delay: 0, easing: 'linear', params: { from: 'left', steps: 4 } },
  params: [fromSideParam, stepsParam],
  tracks: (ctx) => {
    const from = str(ctx.params, 'from', 'left') as Side;
    const steps = clampInt(num(ctx.params, 'steps', 4), 2, 8);
    const distance = offPage(ctx, from);
    const bob = ctx.element.height * 0.04;
    const travelEnd = 0.86;
    const n = steps * 2;
    const frames: MotionFrame[] = [];
    for (let k = 0; k <= n; k++) {
      const p = k / n;
      const up = k % 2 === 1;
      frames.push({
        offset: p * travelEnd,
        x: distance * (1 - p),
        y: up ? -bob : 0,
        rotate: up ? (k % 4 === 1 ? 2.5 : -2.5) : 0,
        easing: 'easeInOut',
      });
    }
    frames.push({ offset: 0.93, ...squash(0.05), easing: 'easeOut' });
    frames.push({ offset: 1 });
    const toward: Side = from === 'left' ? 'right' : 'left';
    return {
      element: frames,
      face: [
        { offset: 0, scaleX: faceToward(ctx, toward) },
        { offset: travelEnd, scaleX: faceToward(ctx, toward), easing: 'easeInOut' },
        { offset: 1, scaleX: baseFlip(ctx) },
      ],
    };
  },
});
