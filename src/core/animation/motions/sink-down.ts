import { defineMotion } from '../motion';
import { stretch } from './helpers';

/** Sinks down below its feet, as if into a hole (hidden below the ground line). */
export const sinkDown = defineMotion({
  id: 'sinkDown',
  label: 'Sink down',
  kind: 'exit',
  defaults: { duration: 900, delay: 0, easing: 'linear' },
  tracks: (ctx) => {
    const h = ctx.element.height;
    const feet = (ctx.pivot?.y ?? 1) * h;
    const below = h - feet;
    const end = feet + 4;
    return {
      element: [
        { offset: 0, y: 0, clipBottom: below, easing: 'easeOut' },
        {
          offset: 0.25,
          y: -h * 0.05,
          clipBottom: below - h * 0.05,
          ...stretch(0.06),
          easing: 'easeIn',
        },
        { offset: 1, y: end, clipBottom: below + end, scaleX: 1, scaleY: 1 },
      ],
    };
  },
});
