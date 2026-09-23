import type { AnimationPreset } from '../types';

export const slideOutDown: AnimationPreset = {
  id: 'slideOutDown',
  label: 'Slide out down',
  kind: 'exit',
  defaults: { duration: 700, delay: 0, easing: 'easeIn', params: { distance: 80 } },
  params: [{ key: 'distance', label: 'Distance', type: 'number', min: 0, max: 1000, step: 10, unit: 'px' }],
  build: ({ params }) => [
    {
      target: 'element',
      keyframes: [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: `translateY(${Number(params.distance ?? 80)}px)` },
      ],
    },
  ],
};
