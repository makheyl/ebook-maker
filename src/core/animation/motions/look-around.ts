import { defineMotion } from '../motion';
import { baseFlip } from './helpers';

/** Looks one way, pauses, looks back — searching for something. */
export const lookAround = defineMotion({
  id: 'lookAround',
  label: 'Look around',
  kind: 'emphasis',
  defaults: { duration: 1800, delay: 0, easing: 'linear' },
  tracks: (ctx) => {
    const base = baseFlip(ctx);
    return {
      element: [
        { offset: 0, rotate: 0, easing: 'easeInOut' },
        { offset: 0.2, rotate: -2, easing: 'easeInOut' },
        { offset: 0.55, rotate: -2, easing: 'easeInOut' },
        { offset: 0.72, rotate: 2, easing: 'easeInOut' },
        { offset: 1, rotate: 0 },
      ],
      face: [
        { offset: 0, scaleX: base, easing: 'easeInOut' },
        { offset: 0.15, scaleX: -base },
        { offset: 0.55, scaleX: -base, easing: 'easeInOut' },
        { offset: 0.7, scaleX: base },
        { offset: 1, scaleX: base },
      ],
    };
  },
});
