import { ancestorsOf, findElement, fromPageSpace, toPageSpace } from '../schema/tree';
import type { BubbleElement, BubbleShape, PageElement, TextElement } from '../schema/types';

/**
 * Speech-bubble outlines (pure): SVG paths in the bubble's own coordinates for the body, the
 * tail pointing at `tip`, and a fill-only "cover" that hides the body's outline where the tail
 * joins it, so balloon and tail read as one shape. Also the text's inset for each shape.
 */
export type Pt = { x: number; y: number };

export type BubbleGeometry = {
  body: string;
  /** Speech/shout/whisper tail (a triangle), or thought bubbles' trail of circles. */
  tail: string | null;
  cover: string | null;
  /** Space kept free of text inside the box (clouds and bursts have a smaller middle). */
  inset: { x: number; y: number };
};

const f = (n: number) => Math.round(n * 100) / 100;

function roundedRect(w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return (
    `M${f(rr)},0 H${f(w - rr)} A${f(rr)},${f(rr)} 0 0 1 ${f(w)},${f(rr)} ` +
    `V${f(h - rr)} A${f(rr)},${f(rr)} 0 0 1 ${f(w - rr)},${f(h)} ` +
    `H${f(rr)} A${f(rr)},${f(rr)} 0 0 1 0,${f(h - rr)} V${f(rr)} A${f(rr)},${f(rr)} 0 0 1 ${f(rr)},0 Z`
  );
}

/** A cloud: bumps around the ellipse that fits the box. */
function cloud(w: number, h: number): string {
  const n = 10;
  const cx = w / 2;
  const cy = h / 2;
  const at = (i: number) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(a) * cx * 0.9, y: cy + Math.sin(a) * cy * 0.86 };
  };
  let d = '';
  for (let i = 0; i < n; i++) {
    const p = at(i);
    const q = at(i + 1);
    const bump = Math.hypot(q.x - p.x, q.y - p.y) * 0.62;
    d += `${i === 0 ? `M${f(p.x)},${f(p.y)} ` : ''}A${f(bump)},${f(bump)} 0 0 1 ${f(q.x)},${f(q.y)} `;
  }
  return `${d}Z`;
}

/** A shout: a spiky burst around the ellipse that fits the box. */
function burst(w: number, h: number): string {
  const n = 18;
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? 0.8 : 1;
    pts.push(`${f(w / 2 + Math.cos(a) * (w / 2) * r)},${f(h / 2 + Math.sin(a) * (h / 2) * r)}`);
  }
  return `M${pts.join(' L')} Z`;
}

/** Where the ray from the box centre towards `tip` leaves the (elliptical or rounded) body. */
function edgePoint(w: number, h: number, tip: Pt, elliptical: boolean): Pt {
  const cx = w / 2;
  const cy = h / 2;
  const dx = tip.x - cx;
  const dy = tip.y - cy;
  if (elliptical) {
    const t = 1 / Math.sqrt((dx * dx) / (cx * cx) + (dy * dy) / (cy * cy));
    return { x: cx + dx * t, y: cy + dy * t };
  }
  const t = Math.min(dx ? cx / Math.abs(dx) : Infinity, dy ? cy / Math.abs(dy) : Infinity);
  return { x: cx + dx * t, y: cy + dy * t };
}

/** Text inset for a shape: clouds and bursts have less usable room than their box. */
export function bubbleInset(shape: BubbleShape, w: number, h: number): { x: number; y: number } {
  if (shape === 'thought') return { x: w * 0.14, y: h * 0.16 };
  if (shape === 'shout') return { x: w * 0.18, y: h * 0.2 };
  return { x: 0, y: 0 };
}

/** The box a bubble's text lays out in: its own box less the shape's inset (for measuring). */
export function bubbleTextBox(el: BubbleElement): TextElement {
  const inset = bubbleInset(el.bubble.shape, el.width, el.height);
  return {
    id: el.id,
    type: 'text',
    name: el.name,
    x: el.x + inset.x,
    y: el.y + inset.y,
    width: el.width - inset.x * 2,
    height: el.height - inset.y * 2,
    rotation: el.rotation,
    opacity: el.opacity,
    locked: el.locked,
    hidden: el.hidden,
    content: el.content,
    style: el.style,
  };
}

/** The bubble height whose text box is `textHeight` tall (the inset grows with the box). */
export function bubbleHeightForText(shape: BubbleShape, textHeight: number): number {
  const ratio = bubbleInset(shape, 1, 1).y;
  return Math.ceil(textHeight / (1 - ratio * 2));
}

export function bubbleGeometry(
  shape: BubbleShape,
  w: number,
  h: number,
  tip: Pt,
  tailWidth: number,
  strokeWidth = 0,
): BubbleGeometry {
  const elliptical = shape === 'thought' || shape === 'shout';
  const body =
    shape === 'thought'
      ? cloud(w, h)
      : shape === 'shout'
        ? burst(w, h)
        : roundedRect(w, h, shape === 'caption' ? Math.min(12, w / 10) : Math.min(w, h) * 0.3);
  const inset = bubbleInset(shape, w, h);
  const inside = tip.x > 0 && tip.x < w && tip.y > 0 && tip.y < h;
  if (shape === 'caption' || inside || w <= 0 || h <= 0) {
    return { body, tail: null, cover: null, inset };
  }

  const edge = edgePoint(w, h, tip, elliptical);
  const len = Math.hypot(tip.x - edge.x, tip.y - edge.y) || 1;
  const ux = (tip.x - edge.x) / len;
  const uy = (tip.y - edge.y) / len;

  if (shape === 'thought') {
    const circles = [
      { t: 0.22, r: tailWidth * 0.42 },
      { t: 0.55, r: tailWidth * 0.28 },
      { t: 0.86, r: tailWidth * 0.17 },
    ]
      .map(({ t, r }) => {
        const x = edge.x + ux * len * t;
        const y = edge.y + uy * len * t;
        return `M${f(x - r)},${f(y)} a${f(r)},${f(r)} 0 1 0 ${f(r * 2)},0 a${f(r)},${f(r)} 0 1 0 ${f(-r * 2)},0 Z`;
      })
      .join(' ');
    return { body, tail: circles, cover: null, inset };
  }

  // The tail's base sits inside the body (a burst's outline dips to 80% of its box, so its
  // base goes deeper); the body is drawn over it, then `cover` hides the body's outline
  // where the tail leaves it, so balloon and tail read as one shape.
  const half = tailWidth / 2;
  const nx = -uy;
  const ny = ux;
  const cx = w / 2;
  const cy = h / 2;
  const rim = shape === 'shout' ? 0.78 : 1;
  const back = Math.min(tailWidth * 0.6, Math.min(w, h) * 0.2);
  const bx = cx + (edge.x - cx) * rim - ux * back;
  const by = cy + (edge.y - cy) * rim - uy * back;
  const b1 = { x: bx + nx * half, y: by + ny * half };
  const b2 = { x: bx - nx * half, y: by - ny * half };
  const tail = `M${f(b1.x)},${f(b1.y)} L${f(tip.x)},${f(tip.y)} L${f(b2.x)},${f(b2.y)} Z`;

  const total = Math.hypot(tip.x - bx, tip.y - by) || 1;
  const s = Math.max(strokeWidth, 1);
  const pastEdge = Math.hypot(edge.x - bx, edge.y - by) + s * 2;
  const t1 = Math.min(0.8, pastEdge / total);
  const lerp = (a: Pt, b: Pt, t: number): Pt => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  const mid = { x: bx, y: by };
  /** A point on a tail side, pulled towards the tail's axis so the side's own outline stays. */
  const inner = (side: Pt, t: number): Pt => {
    const p = lerp(side, tip, t);
    const a = lerp(mid, tip, t);
    const d = Math.hypot(a.x - p.x, a.y - p.y) || 1;
    const k = Math.min(s * 0.6 + 0.5, d * 0.9) / d;
    return { x: p.x + (a.x - p.x) * k, y: p.y + (a.y - p.y) * k };
  };
  const cover = [inner(b1, 0), inner(b1, t1), inner(b2, t1), inner(b2, 0)]
    .map((p, i) => `${i ? 'L' : 'M'}${f(p.x)},${f(p.y)}`)
    .join(' ');
  return { body, tail, cover: `${cover} Z`, inset };
}

/**
 * Where a bubble's tail points, in the bubble's own (unrotated) coordinates: at its target's
 * anchor when attached (through any groups and rotations), else at its free tip.
 */
export function tailTip(elements: readonly PageElement[], bubble: BubbleElement): Pt {
  const target = bubble.tail.targetId ? findElement(elements, bubble.tail.targetId) : undefined;
  if (!target || target.id === bubble.id) return bubble.tail.tip;
  const local = rotateAbout(
    {
      x: target.x + bubble.tail.anchor.x * target.width,
      y: target.y + bubble.tail.anchor.y * target.height,
    },
    { x: target.x + target.width / 2, y: target.y + target.height / 2 },
    target.rotation,
  );
  return pageToBubble(elements, bubble, toPageSpace(ancestorsOf(elements, target.id), local));
}

/** A page point in a bubble's own (unrotated) coordinates, through its groups. */
export function pageToBubble(elements: readonly PageElement[], bubble: BubbleElement, p: Pt): Pt {
  const inParent = fromPageSpace(ancestorsOf(elements, bubble.id), p);
  const own = rotateAbout(
    inParent,
    { x: bubble.x + bubble.width / 2, y: bubble.y + bubble.height / 2 },
    -bubble.rotation,
  );
  return { x: f(own.x - bubble.x), y: f(own.y - bubble.y) };
}

/** The inverse of pageToBubble. */
export function bubbleToPage(elements: readonly PageElement[], bubble: BubbleElement, p: Pt): Pt {
  const inParent = rotateAbout(
    { x: bubble.x + p.x, y: bubble.y + p.y },
    { x: bubble.x + bubble.width / 2, y: bubble.y + bubble.height / 2 },
    bubble.rotation,
  );
  return toPageSpace(ancestorsOf(elements, bubble.id), inParent);
}

function rotateAbout(p: Pt, c: Pt, degrees: number): Pt {
  if (!degrees) return p;
  const r = (degrees * Math.PI) / 180;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return {
    x: c.x + dx * Math.cos(r) - dy * Math.sin(r),
    y: c.y + dx * Math.sin(r) + dy * Math.cos(r),
  };
}
