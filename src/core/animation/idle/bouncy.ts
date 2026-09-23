import type { IdleMotion } from './types';

/** Small continuous hops with a squash on every landing. */
export const bouncy: IdleMotion = {
  id: 'bouncy',
  label: 'Bouncy',
  duration: 1100,
  build: ({ element, intensity }) => {
    const h = element.height * 0.06 * intensity;
    const squash = 1 - 0.08 * intensity;
    return {
      idle: [
        { offset: 0, y: 0, scaleX: 1 / Math.sqrt(squash), scaleY: squash, easing: 'easeOut' },
        { offset: 0.15, y: 0, scaleX: 0.97, scaleY: 1.06, easing: 'easeOut' },
        { offset: 0.5, y: -h, scaleX: 1, scaleY: 1, easing: 'easeIn' },
        { offset: 0.85, y: 0, scaleX: 0.98, scaleY: 1.04, easing: 'easeOut' },
        { offset: 1, y: 0, scaleX: 1 / Math.sqrt(squash), scaleY: squash },
      ],
    };
  },
};
