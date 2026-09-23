import type { AnimationPreset } from '../types';

export const slideUp: AnimationPreset = {
  id: 'slideUp',
  label: 'Slide up',
  kind: 'entrance',
  defaults: { duration: 800, delay: 0, easing: 'easeOut', params: { distance: 80 } },
  params: [
    { key: 'distance', label: 'Distance', type: 'number', min: 0, max: 1000, step: 10, unit: 'px' },
  ],
  build: ({ params }) => [
    {
      target: 'element',
      keyframes: [
        { opacity: 0, transform: `translateY(${Number(params.distance ?? 80)}px)` },
        { opacity: 1, transform: 'translateY(0)' },
      ],
    },
  ],
};
