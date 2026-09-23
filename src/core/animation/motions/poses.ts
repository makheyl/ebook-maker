import type { Character } from '../../schema/types';
import type { KeyframeSpec } from '../types';

/** Index of the pose with this id, or of the first whose name matches the pattern (−1 if none). */
export function findPose(character: Character, idOrPattern: string | RegExp): number {
  return character.poses.findIndex((p) =>
    typeof idOrPattern === 'string' ? p.id === idOrPattern : idOrPattern.test(p.name),
  );
}

/** Opacity keyframes that are 1 inside the windows and 0 outside, with hard cuts. */
function visibility(windows: readonly [number, number][], inside: number): Keyframe[] {
  const outside = 1 - inside;
  const frames: Keyframe[] = [];
  const start = windows[0]?.[0] === 0 ? inside : outside;
  frames.push({ offset: 0, opacity: start });
  for (const [from, to] of windows) {
    if (from > 0)
      frames.push({ offset: from, opacity: outside }, { offset: from, opacity: inside });
    if (to < 1) frames.push({ offset: to, opacity: inside }, { offset: to, opacity: outside });
  }
  const last = windows[windows.length - 1];
  frames.push({ offset: 1, opacity: last && last[1] >= 1 ? inside : outside });
  return frames;
}

/**
 * Shows pose `index` during the given windows (fractions of the step) and hides the
 * character's own artwork meanwhile — like flipping between drawings. `index` −1 shows the
 * artwork itself (all poses hidden) for the whole step.
 */
export function poseSwap(index: number, windows: readonly [number, number][]): KeyframeSpec[] {
  const shown = index >= 0 ? windows : [];
  const pose = visibility(shown, 1);
  const hidden: Keyframe[] = [
    { offset: 0, opacity: 0 },
    { offset: 1, opacity: 0 },
  ];
  return [
    {
      target: 'poses',
      keyframes: hidden,
      perTarget: (i) => (i === index ? pose : hidden),
      easing: 'linear',
    },
    { target: 'base', keyframes: visibility(shown, 0), easing: 'linear' },
  ];
}

/** Evenly spaced windows: n flaps, each open for `duty` of its slot. */
export function flaps(n: number, duty = 0.5): [number, number][] {
  return Array.from({ length: n }, (_, i) => [
    Math.round((i / n) * 1000) / 1000,
    Math.round(((i + duty) / n) * 1000) / 1000,
  ]);
}
