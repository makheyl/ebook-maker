import type { AnimationPreset } from '../types';

export const zoomIn: AnimationPreset = {
  id: 'zoomIn',
  label: 'Zoom in',
  kind: 'entrance',
  defaults: { duration: 700, delay: 0, easing: 'easeOut', params: { from: 0.6 } },
  params: [{ key: 'from', label: 'Start scale', type: 'number', min: 0, max: 3, step: 0.05 }],
  build: ({ params }) => [
    {
      target: 'element',
      keyframes: [
        { opacity: 0, transform: `scale(${Number(params.from ?? 0.6)})` },
        { opacity: 1, transform: 'scale(1)' },
      ],
    },
  ],
};
