import type { AnimationPreset } from '../types';

/**
 * Reveals text a letter (or, for long texts, a word) at a time. The renderer splits the text
 * into units; "Automatic" uses letters up to 600 characters and words beyond (see core/text/split).
 */
export const typewriter: AnimationPreset = {
  id: 'typewriter',
  label: 'Typewriter',
  kind: 'entrance',
  appliesTo: ['text', 'bubble'],
  splitText: 'chars',
  defaults: { duration: 1800, delay: 0, easing: 'linear', params: { by: 'auto' } },
  params: [
    {
      key: 'by',
      label: 'Reveal',
      type: 'select',
      options: [
        { value: 'auto', label: 'Automatic' },
        { value: 'letter', label: 'By letter' },
        { value: 'word', label: 'By word' },
      ],
    },
  ],
  build: () => [
    {
      target: 'chars',
      // Each unit pops in right when its turn comes and is fully shown from then on, so no
      // easing or rounding at the very end can leave a unit hidden.
      keyframes: [{ opacity: 0 }, { opacity: 1, offset: 0.001 }, { opacity: 1 }],
      durationFraction: 0.08,
      easing: 'linear',
    },
  ],
};
