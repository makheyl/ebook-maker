import type { AnimationPreset } from '../types';

export const slideLeft: AnimationPreset = {
  id: 'slideLeft',
  label: 'Slide in from right',
  kind: 'entrance',
  defaults: { duration: 800, delay: 0, easing: 'easeOut', params: { distance: 120 } },
  params: [
    { key: 'distance', label: 'Distance', type: 'number', min: 0, max: 2000, step: 10, unit: 'px' },
  ],
  build: ({ params }) => [
    {
      target: 'element',
      keyframes: [
        { opacity: 0, transform: `translateX(${Number(params.distance ?? 120)}px)` },
        { opacity: 1, transform: 'translateX(0)' },
      ],
    },
  ],
};
