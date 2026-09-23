import type { AnimationPreset } from '../types';

export const pulse: AnimationPreset = {
  id: 'pulse',
  label: 'Pulse',
  kind: 'emphasis',
  defaults: { duration: 700, delay: 0, easing: 'easeInOut', params: { scale: 1.1, iterations: 2 } },
  params: [
    { key: 'scale', label: 'Scale', type: 'number', min: 1, max: 2, step: 0.02 },
    { key: 'iterations', label: 'Repeat', type: 'number', min: 1, max: 20, step: 1, unit: '×' },
  ],
  build: ({ params }) => [
    {
      target: 'element',
      keyframes: [
        { transform: 'scale(1)' },
        { transform: `scale(${Number(params.scale ?? 1.1)})` },
        { transform: 'scale(1)' },
      ],
      iterations: Math.max(1, Math.round(Number(params.iterations ?? 2))),
    },
  ],
};
