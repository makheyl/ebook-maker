import type { PageElement } from '@/core/schema';

export type Point = { x: number; y: number };

/** A point in the element's own (unrotated) px space → page coordinates. */
export function elementToPage(
  el: Pick<PageElement, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
  p: Point,
): Point {
  const cx = el.width / 2;
  const cy = el.height / 2;
  const r = (el.rotation * Math.PI) / 180;
  const dx = p.x - cx;
  const dy = p.y - cy;
  return {
    x: el.x + cx + dx * Math.cos(r) - dy * Math.sin(r),
    y: el.y + cy + dx * Math.sin(r) + dy * Math.cos(r),
  };
}

/** Inverse of elementToPage. */
export function pageToElement(
  el: Pick<PageElement, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
  p: Point,
): Point {
  const cx = el.width / 2;
  const cy = el.height / 2;
  const r = (-el.rotation * Math.PI) / 180;
  const dx = p.x - el.x - cx;
  const dy = p.y - el.y - cy;
  return {
    x: cx + dx * Math.cos(r) - dy * Math.sin(r),
    y: cy + dx * Math.sin(r) + dy * Math.cos(r),
  };
}
