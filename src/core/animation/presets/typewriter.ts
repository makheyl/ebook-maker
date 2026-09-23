import type { AnimationPreset } from '../types';

/** Reveals text character by character (the renderer splits the text into spans). */
export const typewriter: AnimationPreset = {
  id: 'typewriter',
  label: 'Typewriter',
  kind: 'entrance',
  appliesTo: ['text'],
  splitText: 'chars',
  defaults: { duration: 1800, delay: 0, easing: 'linear' },
  build: () => [
    {
      target: 'chars',
      keyframes: [{ opacity: 0 }, { opacity: 1 }],
      durationFraction: 0.08,
      easing: 'steps(1, end)',
    },
  ],
};
