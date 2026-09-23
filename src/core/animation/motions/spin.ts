import { defineMotion } from '../motion';

/** A full spin around its middle with a little lift. */
export const spin = defineMotion({
  id: 'spin',
  label: 'Spin',
  kind: 'emphasis',
  defaults: { duration: 1000, delay: 0, easing: 'linear' },
  tracks: (ctx) => {
    const lift = ctx.element.height * 0.1;
    return {
      elementOrigin: '50% 50%',
      element: [
        { offset: 0, rotate: 0, y: 0, easing: 'easeInOut' },
        { offset: 0.5, rotate: 180, y: -lift, easing: 'easeInOut' },
        { offset: 1, rotate: 360, y: 0 },
      ],
    };
  },
});
