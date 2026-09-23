import type { TransitionPreset } from '../../schema/types';

/**
 * Page transitions: keyframes for the outgoing and incoming page layers.
 * `direction` is 1 when moving forward and -1 when paging back.
 */
export type TransitionDef = {
  id: TransitionPreset;
  label: string;
  build(direction: 1 | -1): { out: Keyframe[] | null; in: Keyframe[] | null; perspective?: boolean };
};

export const TRANSITIONS: readonly TransitionDef[] = [
  { id: 'none', label: 'None', build: () => ({ out: null, in: null }) },
  {
    id: 'fade',
    label: 'Fade',
    build: () => ({ out: [{ opacity: 1 }, { opacity: 0 }], in: [{ opacity: 0 }, { opacity: 1 }] }),
  },
  {
    id: 'slide',
    label: 'Slide',
    build: (d) => ({
      out: [{ transform: 'translateX(0)' }, { transform: `translateX(${-100 * d}%)` }],
      in: [{ transform: `translateX(${100 * d}%)` }, { transform: 'translateX(0)' }],
    }),
  },
  {
    id: 'flip',
    label: 'Flip',
    build: (d) => ({
      perspective: true,
      out: [
        { transform: 'rotateY(0deg)', opacity: 1 },
        { transform: `rotateY(${-90 * d}deg)`, opacity: 1, offset: 0.5 },
        { transform: `rotateY(${-90 * d}deg)`, opacity: 0 },
      ],
      in: [
        { transform: `rotateY(${90 * d}deg)`, opacity: 0 },
        { transform: `rotateY(${90 * d}deg)`, opacity: 1, offset: 0.5 },
        { transform: 'rotateY(0deg)', opacity: 1 },
      ],
    }),
  },
  {
    id: 'zoom',
    label: 'Zoom',
    build: (d) => ({
      out: [
        { transform: 'scale(1)', opacity: 1 },
        { transform: `scale(${d > 0 ? 1.15 : 0.85})`, opacity: 0 },
      ],
      in: [
        { transform: `scale(${d > 0 ? 0.85 : 1.15})`, opacity: 0 },
        { transform: 'scale(1)', opacity: 1 },
      ],
    }),
  },
];

export function getTransition(id: string): TransitionDef {
  return TRANSITIONS.find((t) => t.id === id) ?? TRANSITIONS[0]!;
}
