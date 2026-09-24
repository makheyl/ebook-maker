import type { TextElement, TextStyle } from '../schema/types';

/**
 * Text auto-fit rules (pure). Measuring needs a DOM, so the editor measures and stores the
 * result; the renderer only applies it — the reader never measures (editor = export).
 */

export type Autofit = 'grow' | 'shrink' | 'none';

/** The smallest the text may shrink to (30% of its size). */
export const MIN_FIT_SCALE = 0.3;
/** Boxes never grow shorter than this. */
export const MIN_TEXT_HEIGHT = 20;

export const autofitOf = (style: Pick<TextStyle, 'autofit'>): Autofit => style.autofit ?? 'grow';

/** The font size the text is drawn at. */
export function effectiveFontSize(style: TextStyle): number {
  const scale = autofitOf(style) === 'shrink' ? (style.fitScale ?? 1) : 1;
  return Math.round(style.fontSize * scale * 100) / 100;
}

/**
 * The largest scale in [MIN_FIT_SCALE, 1] at which the text's height fits `height`.
 * `measure(scale)` returns the content height at that scale. Returns MIN_FIT_SCALE when even
 * that doesn't fit (the caller flags it as overflowing).
 */
export function findFitScale(measure: (scale: number) => number, height: number): number {
  if (measure(1) <= height + 0.5) return 1;
  let lo = MIN_FIT_SCALE;
  let hi = 1;
  if (measure(lo) > height + 0.5) return lo;
  for (let i = 0; i < 12 && hi - lo > 0.005; i++) {
    const mid = (lo + hi) / 2;
    if (measure(mid) <= height + 0.5) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo * 1000) / 1000;
}

/**
 * Growing a box: it takes the height its text needs, but never runs past the page bottom.
 * `capped` means the box stopped at the page and the text should shrink instead.
 */
export function growHeight(
  needed: number,
  top: number,
  pageHeight: number,
): { height: number; capped: boolean } {
  const room = Math.floor(pageHeight - Math.max(0, top));
  const height = Math.max(MIN_TEXT_HEIGHT, Math.ceil(needed));
  if (height > room && room >= MIN_TEXT_HEIGHT * 2) return { height: room, capped: true };
  return { height, capped: false };
}

/** True when the box's bounds leave the page (ignores sub-pixel rounding). */
export function offPage(
  el: Pick<TextElement, 'x' | 'y' | 'width' | 'height'>,
  page: { width: number; height: number },
): boolean {
  return (
    el.y < -1 || el.x < -1 || el.y + el.height > page.height + 1 || el.x + el.width > page.width + 1
  );
}
