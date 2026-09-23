import { defineMotion } from '../motion';
import { baseFlip } from './helpers';

/** Turns to face the other way (and stays turned for the rest of the page). */
export const turnAround = defineMotion({
  id: 'turnAround',
  label: 'Turn around',
  kind: 'emphasis',
  holdEnd: true,
  defaults: { duration: 600, delay: 0, easing: 'linear' },
  tracks: (ctx) => {
    const base = baseFlip(ctx);
    const lift = ctx.element.height * 0.04;
    return {
      element: [
        { offset: 0, y: 0, easing: 'easeOut' },
        { offset: 0.5, y: -lift, easing: 'easeIn' },
        { offset: 1, y: 0 },
      ],
      face: [
        { offset: 0, scaleX: base, easing: 'easeInOut' },
        { offset: 1, scaleX: -base },
      ],
    };
  },
});
