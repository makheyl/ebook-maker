import type { AnimationPreset, BuildContext } from '../types';

/** A bubble grows out of (and shrinks back into) the point its tail touches. */
const tipOrigin = ({ tailTip, element }: BuildContext) => {
  if (!tailTip) return '50% 100%';
  const clamp = (v: number, size: number) => Math.min(size * 1.5, Math.max(-size * 0.5, v));
  return `${Math.round(clamp(tailTip.x, element.width))}px ${Math.round(clamp(tailTip.y, element.height))}px`;
};

export const popFromTail: AnimationPreset = {
  id: 'popFromTail',
  label: 'Pop from tail',
  kind: 'entrance',
  appliesTo: ['bubble'],
  defaults: { duration: 500, delay: 0, easing: 'linear' },
  build: (ctx) => {
    const transformOrigin = tipOrigin(ctx);
    return [
      {
        target: 'element',
        keyframes: [
          {
            opacity: 0,
            transform: 'scale(0.1)',
            transformOrigin,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          },
          { opacity: 1, transform: 'scale(1.06)', transformOrigin, offset: 0.65 },
          { opacity: 1, transform: 'scale(1)', transformOrigin },
        ],
      },
    ];
  },
};

export const popToTail: AnimationPreset = {
  id: 'popToTail',
  label: 'Pop into tail',
  kind: 'exit',
  appliesTo: ['bubble'],
  defaults: { duration: 350, delay: 0, easing: 'linear' },
  build: (ctx) => {
    const transformOrigin = tipOrigin(ctx);
    return [
      {
        target: 'element',
        keyframes: [
          { opacity: 1, transform: 'scale(1)', transformOrigin, easing: 'ease-in' },
          { opacity: 1, transform: 'scale(1.05)', transformOrigin, offset: 0.25 },
          { opacity: 0, transform: 'scale(0.1)', transformOrigin },
        ],
      },
    ];
  },
};

/** A gentle wobble around the tail, for a surprised or excited line. */
export const wobble: AnimationPreset = {
  id: 'wobble',
  label: 'Wobble',
  kind: 'emphasis',
  appliesTo: ['bubble'],
  defaults: { duration: 800, delay: 0, easing: 'easeInOut' },
  build: (ctx) => {
    const transformOrigin = tipOrigin(ctx);
    return [
      {
        target: 'element',
        keyframes: [-5, 4, -3, 2, 0].reduce<Keyframe[]>(
          (frames, deg) => [...frames, { transform: `rotate(${deg}deg)`, transformOrigin }],
          [{ transform: 'rotate(0deg)', transformOrigin }],
        ),
      },
    ];
  },
};
