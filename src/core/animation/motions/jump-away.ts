import { defineMotion } from '../motion';
import { facing, offTop, squash, stretch } from './helpers';

/** A big jump up and off the top of the page. */
export const jumpAway = defineMotion({
  id: 'jumpAway',
  label: 'Jump away',
  kind: 'exit',
  defaults: { duration: 900, delay: 0, easing: 'linear' },
  tracks: (ctx) => {
    const drift = ctx.element.width * 0.15 * (facing(ctx) === 'right' ? 1 : -1);
    return {
      element: [
        { offset: 0, y: 0, x: 0, scaleX: 1, scaleY: 1, easing: 'easeOut' },
        { offset: 0.25, y: 0, x: 0, ...squash(0.18), easing: 'easeOut' },
        {
          offset: 0.4,
          y: -ctx.element.height * 0.2,
          x: drift * 0.2,
          ...stretch(0.15),
          easing: 'linear',
        },
        { offset: 1, y: offTop(ctx), x: drift, rotate: drift > 0 ? 8 : -8, ...stretch(0.1) },
      ],
    };
  },
});
