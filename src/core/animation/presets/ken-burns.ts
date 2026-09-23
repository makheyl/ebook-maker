import type { AnimationPreset } from '../types';

/** Slow documentary-style zoom and pan inside the image frame. */
export const kenBurns: AnimationPreset = {
  id: 'kenBurns',
  label: 'Ken Burns',
  kind: 'emphasis',
  appliesTo: ['image'],
  holdEnd: true,
  defaults: {
    duration: 7000,
    delay: 0,
    easing: 'easeInOut',
    params: { zoom: 1.2, direction: 'in-left' },
  },
  params: [
    { key: 'zoom', label: 'Zoom', type: 'number', min: 1, max: 2, step: 0.05 },
    {
      key: 'direction',
      label: 'Pan',
      type: 'select',
      options: [
        { value: 'in-left', label: 'Zoom in, drift left' },
        { value: 'in-right', label: 'Zoom in, drift right' },
        { value: 'out', label: 'Zoom out' },
      ],
    },
  ],
  build: ({ params }) => {
    const zoom = Number(params.zoom ?? 1.2);
    const shift = ((zoom - 1) / 2) * 100 * 0.8;
    const dir = String(params.direction ?? 'in-left');
    const start = dir === 'out' ? `scale(${zoom})` : 'scale(1) translate(0, 0)';
    const end =
      dir === 'out'
        ? 'scale(1)'
        : `scale(${zoom}) translate(${dir === 'in-left' ? -shift : shift}%, ${-shift / 2}%)`;
    return [{ target: 'media', keyframes: [{ transform: start }, { transform: end }] }];
  },
};
