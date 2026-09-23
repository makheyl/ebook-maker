import type { IdleMotion } from './types';

/** Asleep: slow, deep breaths with a sleepy tilt. */
export const snooze: IdleMotion = {
  id: 'snooze',
  label: 'Snooze',
  duration: 5200,
  build: ({ intensity, character }) => {
    const sy = 1 + 0.045 * intensity;
    const tilt = (character.facing === 'right' ? 1 : -1) * 3 * intensity;
    return {
      idle: [
        { offset: 0, rotate: tilt, scaleX: 1, scaleY: 1, easing: 'easeInOut' },
        {
          offset: 0.45,
          rotate: tilt * 1.4,
          scaleX: 1 / Math.sqrt(sy),
          scaleY: sy,
          easing: 'easeInOut',
        },
        { offset: 1, rotate: tilt, scaleX: 1, scaleY: 1 },
      ],
    };
  },
};
