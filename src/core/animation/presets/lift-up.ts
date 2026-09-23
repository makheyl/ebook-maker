import type { AnimationPreset } from '../types';

/** Lifts an element like a paper flap hinged at its top edge (used by lift-the-flap). */
export const liftUp: AnimationPreset = {
  id: 'liftUp',
  label: 'Lift up (flap)',
  kind: 'exit',
  defaults: { duration: 650, delay: 0, easing: 'easeIn' },
  build: () => [
    {
      target: 'element',
      keyframes: [
        { transformOrigin: '50% 0%', transform: 'perspective(900px) rotateX(0deg)', opacity: 1 },
        {
          transformOrigin: '50% 0%',
          transform: 'perspective(900px) rotateX(-75deg)',
          opacity: 1,
          offset: 0.7,
        },
        { transformOrigin: '50% 0%', transform: 'perspective(900px) rotateX(-100deg)', opacity: 0 },
      ],
    },
  ],
};
