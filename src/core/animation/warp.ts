import { resolveEasing } from './easing';

/** One keyframe of a bend: `sway` −1…1 scales the bend amplitude. */
export type BendFrame = { offset: number; sway: number; easing?: string };

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Keyframes for strip i of n so the character bends smoothly above its feet. The sideways
 * offset grows with height above the feet (quadratically), and each strip is sheared so its
 * top and bottom edges meet its neighbours' — the outline stays continuous, with no steps.
 */
export function stripKeyframes(
  height: number,
  feetY: number,
  amplitude: number,
  frames: readonly BendFrame[],
): (index: number, count: number) => Keyframe[] {
  const feet = Math.max(1e-3, feetY) * height;
  const reach = (y: number) => {
    const f = Math.min(1, Math.max(0, (feet - y) / feet));
    return f * f;
  };
  return (i, n) => {
    const top = (i * height) / n;
    const bottom = ((i + 1) * height) / n;
    const stripH = bottom - top;
    return frames.map((f) => {
      const oTop = amplitude * f.sway * reach(top);
      const oBottom = amplitude * f.sway * reach(bottom);
      const mid = (oTop + oBottom) / 2;
      // CSS skewX(θ) shifts a point by tan(θ)·y (y downward from the strip's centre), so the
      // top edge moves by −tan(θ)·h/2: θ = atan((oBottom − oTop) / h) lands both edges exactly.
      const skew = (Math.atan((oBottom - oTop) / stripH) * 180) / Math.PI;
      const kf: Keyframe = {
        offset: f.offset,
        transform: `translateX(${round(mid)}px) skewX(${round(skew)}deg)`,
      };
      if (f.easing) kf.easing = resolveEasing(f.easing);
      return kf;
    });
  };
}
