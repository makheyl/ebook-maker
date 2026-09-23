import type { NormalizedRect } from '../schema/types';

export type AlphaInfo = { hasAlpha: boolean; opaqueBounds?: NormalizedRect };

/** Pixels at or below this alpha count as background. */
export const ALPHA_THRESHOLD = 8;

/**
 * Finds whether an image has transparency and where its visible pixels are, from RGBA data
 * (usually a ≤256 px sample). The visible box gives a character's default pivot (its feet)
 * and the width of its ground shadow.
 */
export function analyzeAlpha(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = ALPHA_THRESHOLD,
): AlphaInfo {
  let hasAlpha = false;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3]!;
      if (a < 255) hasAlpha = true;
      if (a > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { hasAlpha }; // fully transparent
  if (!hasAlpha) return { hasAlpha, opaqueBounds: { x: 0, y: 0, width: 1, height: 1 } };
  return {
    hasAlpha,
    opaqueBounds: {
      x: minX / width,
      y: minY / height,
      width: (maxX - minX + 1) / width,
      height: (maxY - minY + 1) / height,
    },
  };
}

/** Size of the sample used for alpha analysis. */
export function sampleSize(width: number, height: number, max = 256) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
