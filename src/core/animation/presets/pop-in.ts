import type { AnimationPreset } from '../types';

export const popIn: AnimationPreset = {
  id: 'popIn',
  label: 'Pop in',
  kind: 'entrance',
  defaults: { duration: 600, delay: 0, easing: 'linear' },
  build: () => [
    {
      target: 'element',
      keyframes: [
        { opacity: 0, transform: 'scale(0.3)', easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        { opacity: 1, transform: 'scale(1.08)', offset: 0.6, easing: 'ease-in-out' },
        { opacity: 1, transform: 'scale(0.98)', offset: 0.8, easing: 'ease-in-out' },
        { opacity: 1, transform: 'scale(1)' },
      ],
    },
  ],
};
