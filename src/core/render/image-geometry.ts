import type { NormalizedRect } from '../schema/types';

export type Size = { width: number; height: number };
export type ImageLayout = { left: number; top: number; width: number; height: number };

/**
 * Where to draw the full source image inside an element box so that the crop region
 * covers the box (like object-fit: cover applied to the crop), centered.
 *
 * All values are in page units. The box clips with overflow: hidden, so nothing outside
 * the crop is visible — the original bitmap is never modified (non-destructive crop).
 */
export function imageLayout(natural: Size, crop: NormalizedRect, box: Size): ImageLayout {
  const cropW = Math.max(1e-6, crop.width * natural.width);
  const cropH = Math.max(1e-6, crop.height * natural.height);
  const scale = Math.max(box.width / cropW, box.height / cropH);
  const width = natural.width * scale;
  const height = natural.height * scale;
  const left = -crop.x * natural.width * scale + (box.width - cropW * scale) / 2;
  const top = -crop.y * natural.height * scale + (box.height - cropH * scale) / 2;
  return { left, top, width, height };
}

/** Aspect ratio (w / h) of a crop region in source pixels. */
export function cropAspect(natural: Size, crop: NormalizedRect): number {
  return (crop.width * natural.width) / (crop.height * natural.height);
}
