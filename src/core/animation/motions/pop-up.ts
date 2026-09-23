import { defineMotion } from '../motion';
import { squash, stretch } from './helpers';

/** Pops up from below its feet, as if out of a hole (hidden below the ground line). */
export const popUp = defineMotion({
  id: 'popUp',
  label: 'Pop up',
  kind: 'entrance',
  defaults: { duration: 900, delay: 0, easing: 'linear' },
  tracks: (ctx) => {
    const h = ctx.element.height;
    const feet = (ctx.pivot?.y ?? 1) * h;
    const below = h - feet; // px from the element's bottom edge up to the feet line
    const start = feet + 4;
    return {
      element: [
        { offset: 0, y: start, clipBottom: below + start, ...stretch(0.12), easing: 'easeOut' },
        {
          offset: 0.55,
          y: -h * 0.1,
          clipBottom: below - h * 0.1,
          ...stretch(0.1),
          easing: 'easeIn',
        },
        { offset: 0.78, y: 0, clipBottom: below, ...squash(0.08), easing: 'easeOut' },
        { offset: 1, y: 0, clipBottom: below },
      ],
    };
  },
});
