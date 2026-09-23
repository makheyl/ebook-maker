import type { ElementGeometry } from './schema/types';

export type Rect = { x: number; y: number; width: number; height: number };

/** Axis-aligned bounding box of an element after rotation about its center. */
export function rotatedBounds(el: ElementGeometry): Rect {
  const rad = (el.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const w = el.width * cos + el.height * sin;
  const h = el.width * sin + el.height * cos;
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}

export function unionRects(rects: readonly Rect[]): Rect | null {
  if (!rects.length) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const r of rects) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.width);
    y2 = Math.max(y2, r.y + r.height);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export type AlignEdge = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/**
 * Position deltas that align elements to `target` (the page for a single element, the
 * selection bounds for several). Uses rotated bounds so rotated elements line up visually.
 */
export function alignDeltas(
  elements: readonly (ElementGeometry & { id: string })[],
  edge: AlignEdge,
  target: Rect,
): { id: string; dx: number; dy: number }[] {
  return elements.map((el) => {
    const b = rotatedBounds(el);
    let dx = 0;
    let dy = 0;
    if (edge === 'left') dx = target.x - b.x;
    if (edge === 'center') dx = target.x + target.width / 2 - (b.x + b.width / 2);
    if (edge === 'right') dx = target.x + target.width - (b.x + b.width);
    if (edge === 'top') dy = target.y - b.y;
    if (edge === 'middle') dy = target.y + target.height / 2 - (b.y + b.height / 2);
    if (edge === 'bottom') dy = target.y + target.height - (b.y + b.height);
    return { id: el.id, dx, dy };
  });
}

/** Evenly spaces 3+ elements between the outermost ones along an axis. */
export function distributeDeltas(
  elements: readonly (ElementGeometry & { id: string })[],
  axis: 'horizontal' | 'vertical',
): { id: string; dx: number; dy: number }[] {
  if (elements.length < 3) return elements.map((e) => ({ id: e.id, dx: 0, dy: 0 }));
  const withBounds = elements.map((el) => ({ el, b: rotatedBounds(el) }));
  const pos = (b: Rect) => (axis === 'horizontal' ? b.x : b.y);
  const size = (b: Rect) => (axis === 'horizontal' ? b.width : b.height);
  withBounds.sort((a, b) => pos(a.b) - pos(b.b));
  const first = withBounds[0]!.b;
  const last = withBounds[withBounds.length - 1]!.b;
  const span = pos(last) + size(last) - pos(first);
  const total = withBounds.reduce((sum, { b }) => sum + size(b), 0);
  const gap = (span - total) / (withBounds.length - 1);
  let cursor = pos(first);
  return withBounds.map(({ el, b }) => {
    const delta = cursor - pos(b);
    cursor += size(b) + gap;
    return { id: el.id, dx: axis === 'horizontal' ? delta : 0, dy: axis === 'vertical' ? delta : 0 };
  });
}
