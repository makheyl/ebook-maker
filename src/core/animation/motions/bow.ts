import { defineMotion, num, type MotionFrame } from '../motion';
import { clampInt, facing } from './helpers';

/** Leans forward (toward where it's looking) and back — a bow or a nod. */
export const bow = defineMotion({
  id: 'bow',
  label: 'Bow / nod',
  kind: 'emphasis',
  defaults: { duration: 1200, delay: 0, easing: 'linear', params: { angle: 14, count: 1 } },
  params: [
    { key: 'angle', label: 'Angle', type: 'number', min: 4, max: 35, step: 1, unit: '°' },
    { key: 'count', label: 'Times', type: 'number', min: 1, max: 4, step: 1 },
  ],
  tracks: (ctx) => {
    const count = clampInt(num(ctx.params, 'count', 1), 1, 4);
    const a = num(ctx.params, 'angle', 14) * (facing(ctx) === 'right' ? 1 : -1);
    const frames: MotionFrame[] = [{ offset: 0, rotate: 0, easing: 'easeInOut' }];
    for (let i = 0; i < count; i++) {
      const t0 = i / count;
      const span = 1 / count;
      frames.push({ offset: t0 + span * 0.35, rotate: a, easing: 'linear' });
      frames.push({ offset: t0 + span * 0.6, rotate: a, easing: 'easeInOut' });
      frames.push({ offset: t0 + span, rotate: 0, easing: 'easeInOut' });
    }
    return { element: frames };
  },
});
