import type { AnimationPreset } from '../types';

export const fadeIn: AnimationPreset = {
  id: 'fadeIn',
  label: 'Fade in',
  kind: 'entrance',
  defaults: { duration: 700, delay: 0, easing: 'easeOut' },
  build: () => [{ target: 'element', keyframes: [{ opacity: 0 }, { opacity: 1 }] }],
};
