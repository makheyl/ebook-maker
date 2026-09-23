import { defineMotion } from '../motion';
import { offTop, squash, stretch } from './helpers';

/** Falls in from above the page, squashes on impact and bounces once. */
export const dropIn = defineMotion({
  id: 'dropIn',
  label: 'Drop in',
  kind: 'entrance',
  defaults: { duration: 1100, delay: 0, easing: 'linear' },
  tracks: (ctx) => {
    const h = ctx.element.height;
    return {
      element: [
        { offset: 0, y: offTop(ctx), ...stretch(0.1), easing: 'easeIn' },
        { offset: 0.6, y: 0, ...squash(0.2), easing: 'easeOut' },
        { offset: 0.74, y: -h * 0.08, ...stretch(0.04), easing: 'easeIn' },
        { offset: 0.86, y: 0, ...squash(0.07), easing: 'easeOut' },
        { offset: 1, y: 0 },
      ],
    };
  },
});
