import { defineMotion, num, type MotionFrame } from '../motion';
import { intensityParam, squash } from './helpers';

/** Shivers with cold or fear: tiny fast jitters while hunching down. */
export const shiver = defineMotion({
  id: 'shiver',
  label: 'Shiver',
  kind: 'emphasis',
  defaults: { duration: 1000, delay: 0, easing: 'linear', params: { intensity: 1 } },
  params: [intensityParam],
  tracks: (ctx) => {
    const k = num(ctx.params, 'intensity', 1);
    const jitter = Math.max(2, ctx.element.width * 0.012) * k;
    const hunch = squash(0.05 * k);
    const n = 14;
    const frames: MotionFrame[] = [{ offset: 0, x: 0, scaleX: 1, scaleY: 1 }];
    for (let i = 1; i < n; i++) {
      frames.push({ offset: i / n, x: i % 2 ? jitter : -jitter, ...hunch });
    }
    frames.push({ offset: 1, x: 0, scaleX: 1, scaleY: 1 });
    return { element: frames };
  },
});
