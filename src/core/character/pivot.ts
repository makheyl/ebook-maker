import { imageLayout } from '../render/image-geometry';
import type { AssetRef, Character, ImageElement, NormalizedRect } from '../schema/types';

/**
 * Converts a character's pivot (0–1 in the artwork) to element-local 0–1 coordinates, taking
 * the element's crop, size and flips into account. Used as the transform-origin of motions, so
 * a character squashes on its feet wherever the artwork is placed.
 */
export function pivotToLocal(
  asset: Pick<AssetRef, 'width' | 'height'>,
  element: Pick<ImageElement, 'crop' | 'width' | 'height' | 'flipX' | 'flipY'>,
  pivot: Character['pivot'],
): { x: number; y: number } {
  const layout = imageLayout(asset, element.crop, element);
  let x = (layout.left + pivot.x * layout.width) / element.width;
  let y = (layout.top + pivot.y * layout.height) / element.height;
  if (element.flipX) x = 1 - x;
  if (element.flipY) y = 1 - y;
  return { x, y };
}

/** The default pivot: bottom centre of the visible pixels (the feet), or of the whole image. */
export function defaultPivot(opaqueBounds?: NormalizedRect): Character['pivot'] {
  if (!opaqueBounds) return { x: 0.5, y: 1 };
  return {
    x: opaqueBounds.x + opaqueBounds.width / 2,
    y: Math.min(1, opaqueBounds.y + opaqueBounds.height),
  };
}

/** Width of the visible artwork in element-local 0–1 units (for sizing the ground shadow). */
export function visibleWidthLocal(
  asset: Pick<AssetRef, 'width' | 'height' | 'opaqueBounds'>,
  element: Pick<ImageElement, 'crop' | 'width' | 'height'>,
): number {
  const layout = imageLayout(asset, element.crop, element);
  const fraction = asset.opaqueBounds?.width ?? 1;
  return Math.min(1, (fraction * layout.width) / element.width);
}
