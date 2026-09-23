import { rotatedBounds, type Rect } from '../geometry';
import type { AssetRef, Page, PageSize } from '../schema/types';
import { defaultPivot } from './pivot';

/** Fraction of the page height where characters stand. */
export const GROUND_LINE = 0.92;
/** Default character height as a fraction of the page height. */
export const CHARACTER_HEIGHT = 0.4;

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Where to put a character on a page: ~40% of the page tall, feet on the ground line, in the
 * left or right third — whichever covers less text. Reuses `slot` (the previous page's spot)
 * so the character stays put from page to page.
 */
export function placeCharacter(
  page: Pick<Page, 'elements'>,
  pageSize: PageSize,
  asset: Pick<AssetRef, 'width' | 'height' | 'opaqueBounds'>,
  slot?: Rect,
): Rect {
  if (slot) return { ...slot };
  const height = pageSize.height * CHARACTER_HEIGHT;
  const width = height * (asset.width / asset.height);
  const feet = defaultPivot(asset.opaqueBounds);
  const y = pageSize.height * GROUND_LINE - feet.y * height;
  const clampX = (x: number) => Math.min(pageSize.width - width, Math.max(0, x));
  const candidates: Rect[] = [
    { x: clampX(pageSize.width / 6 - width / 2), y, width, height },
    { x: clampX((pageSize.width * 5) / 6 - width / 2), y, width, height },
  ];
  const text = page.elements.filter((e) => e.type === 'text' && !e.hidden).map(rotatedBounds);
  const score = (r: Rect) => text.reduce((sum, t) => sum + overlap(r, t), 0);
  return candidates.reduce((best, c) => (score(c) < score(best) ? c : best));
}
