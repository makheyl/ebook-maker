import type { IdleMotion } from './types';

/** Floats up and down; the shadow shrinks when the character is high. */
export const float: IdleMotion = {
  id: 'float',
  label: 'Float',
  duration: 3600,
  build: ({ element, intensity }) => {
    const lift = element.height * 0.05 * intensity;
    return {
      idle: [
        { offset: 0, y: -lift * 0.2, easing: 'easeInOut' },
        { offset: 0.5, y: -lift, easing: 'easeInOut' },
        { offset: 1, y: -lift * 0.2 },
      ],
    };
  },
};
