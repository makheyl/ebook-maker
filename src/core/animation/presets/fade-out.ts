import type { AnimationPreset } from '../types';

export const fadeOut: AnimationPreset = {
  id: 'fadeOut',
  label: 'Fade out',
  kind: 'exit',
  defaults: { duration: 600, delay: 0, easing: 'easeIn' },
  build: () => [{ target: 'element', keyframes: [{ opacity: 1 }, { opacity: 0 }] }],
};
