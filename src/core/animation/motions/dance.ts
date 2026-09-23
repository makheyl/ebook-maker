import { defineMotion, num, type MotionFrame } from '../motion';
import { intensityParam, squash } from './helpers';

/** A little dance: rock and bop to the beat (loop it for a party). */
export const dance = defineMotion({
  id: 'dance',
  label: 'Dance',
  kind: 'emphasis',
  defaults: { duration: 2000, delay: 0, easing: 'linear', params: { intensity: 1 } },
  params: [intensityParam],
  tracks: (ctx) => {
    const k = num(ctx.params, 'intensity', 1);
    const a = 8 * k;
    const h = ctx.element.height * 0.06 * k;
    const beats = 4;
    const frames: MotionFrame[] = [{ offset: 0, rotate: 0, y: 0, scaleX: 1, scaleY: 1 }];
    for (let b = 0; b < beats; b++) {
      const t0 = b / beats;
      const side = b % 2 ? -1 : 1;
      frames.push({
        offset: t0 + 0.12 / beats,
        y: 0,
        ...squash(0.06 * k),
        rotate: side * a * 0.3,
        easing: 'easeOut',
      });
      frames.push({
        offset: t0 + 0.5 / beats,
        y: -h,
        rotate: side * a,
        scaleX: 1,
        scaleY: 1,
        easing: 'easeIn',
      });
      frames.push({
        offset: t0 + 1 / beats,
        y: 0,
        rotate: 0,
        scaleX: 1,
        scaleY: 1,
        easing: 'easeOut',
      });
    }
    return { element: frames };
  },
});
