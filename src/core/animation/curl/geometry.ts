/**
 * Page-curl geometry (pure). A single page is hinged on its left edge (the spine). Turning it
 * lifts the bottom-right corner C to a point P; the page folds along the perpendicular
 * bisector of C and P. Everything on C's side of that line is lifted: it shows the page
 * underneath, and its reflection across the line is the flap (the page's back) lying over what
 * is still flat. Polygons always have the same number of points, so per-frame updates never
 * change the shape of what's drawn — only where its points are.
 */

export type Pt = { x: number; y: number };
export type Size = { width: number; height: number };

/** A CSS matrix(a, b, c, d, e, f). */
export type Matrix = readonly [number, number, number, number, number, number];

export type CurlFrame = {
  /** Where the page's corner is now. */
  corner: Pt;
  /** A point on the fold line (the midpoint of the corner's start and now). */
  foldPoint: Pt;
  /** Unit normal of the fold line, pointing into the lifted side. */
  normal: Pt;
  /** The part of the turning page still lying flat (its front shows here). */
  front: Pt[];
  /** The part lifted off: the page underneath shows here; reflected, it's the flap. */
  lifted: Pt[];
  /** Reflection across the fold line: puts `lifted` where the flap lies. */
  mirror: Matrix;
  /** 0 = flat, 1 = turned all the way over. */
  progress: number;
};

/** Polygons are padded to this many points (a rectangle cut by a line has at most 5). */
export const POLY_POINTS = 5;

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Keeps the corner where a page hinged at the spine can actually reach: no farther from the
 * spine's bottom than the page is wide, and no farther from its top than the page's diagonal.
 */
export function clampCorner({ width: W, height: H }: Size, p: Pt): Pt {
  let q = { ...p };
  const limit = (cx: number, cy: number, r: number) => {
    const dx = q.x - cx;
    const dy = q.y - cy;
    const d = Math.hypot(dx, dy);
    if (d > r) q = { x: cx + (dx / d) * r, y: cy + (dy / d) * r };
  };
  limit(0, H, W);
  limit(0, 0, Math.hypot(W, H));
  // The corner never goes below the page's bottom edge (the page lies on a table).
  if (q.y > H) q = { x: q.x, y: H };
  return q;
}

/** How far a corner at `p` has turned the page: 0 at rest, 1 flipped over the spine. */
export function progressOf({ width: W }: Size, p: Pt): number {
  return Math.min(1, Math.max(0, (W - p.x) / (2 * W)));
}

/**
 * The corner's path for an automatic turn (keys, taps, buttons): it lifts a little as it
 * sweeps over, like a hand turning a page. t = 0 at rest, 1 turned over.
 */
export function cornerAt({ width: W, height: H }: Size, t: number): Pt {
  const a = Math.PI * Math.min(1, Math.max(0, t));
  const lift = Math.min(H * 0.22, W * 0.5);
  return { x: W * Math.cos(a), y: H - lift * Math.sin(a) };
}

/** Clips a convex polygon to the half-plane where (q − m)·n ≥ 0 (Sutherland–Hodgman). */
function clip(poly: readonly Pt[], m: Pt, n: Pt): Pt[] {
  const side = (q: Pt) => (q.x - m.x) * n.x + (q.y - m.y) * n.y;
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/** Pads (or, for an empty region, fills) a polygon to POLY_POINTS points. */
function pad(poly: Pt[], empty: Pt): Pt[] {
  const pts = poly.length ? poly : [empty];
  const out = pts.map((p) => ({ x: round(p.x), y: round(p.y) }));
  while (out.length < POLY_POINTS) out.push({ ...out[out.length - 1]! });
  return out.slice(0, POLY_POINTS);
}

/** The whole fold for a page of `size` whose bottom-right corner is at `p` (clamped). */
export function curlFrame(size: Size, p: Pt): CurlFrame {
  const { width: W, height: H } = size;
  const start = { x: W, y: H };
  const corner = clampCorner(size, p);
  const dx = start.x - corner.x;
  const dy = start.y - corner.y;
  const len = Math.hypot(dx, dy);
  const rect = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: H },
    { x: 0, y: H },
  ];
  if (len < 0.5) {
    return {
      corner,
      foldPoint: start,
      normal: { x: 1, y: 0 },
      front: pad(rect, start),
      lifted: pad([], start),
      mirror: [1, 0, 0, 1, 0, 0],
      progress: 0,
    };
  }
  const n = { x: dx / len, y: dy / len };
  const m = { x: (start.x + corner.x) / 2, y: (start.y + corner.y) / 2 };
  const lifted = clip(rect, m, n);
  const front = clip(rect, m, { x: -n.x, y: -n.y });
  // Reflection across the line through m with normal n: q' = q − 2((q − m)·n) n.
  const a = 1 - 2 * n.x * n.x;
  const b = -2 * n.x * n.y;
  const d = 1 - 2 * n.y * n.y;
  const k = 2 * (m.x * n.x + m.y * n.y);
  const mirror: Matrix = [a, b, b, d, round(k * n.x), round(k * n.y)];
  return {
    corner: { x: round(corner.x), y: round(corner.y) },
    foldPoint: { x: round(m.x), y: round(m.y) },
    normal: n,
    front: pad(front, { x: 0, y: 0 }),
    lifted: pad(lifted, start),
    mirror,
    progress: progressOf(size, corner),
  };
}

/** A CSS clip-path for a polygon. */
export const polygonCss = (poly: readonly Pt[]) =>
  `polygon(${poly.map((p) => `${p.x}px ${p.y}px`).join(', ')})`;

/**
 * A linear-gradient across the fold, for shading: `stops` are [distance from the fold in px
 * (positive = into the lifted side), colour]. Works for any box of `size` whose coordinates
 * match the page's (the gradient line is computed for that box).
 */
export function foldGradient(
  size: Size,
  frame: Pick<CurlFrame, 'foldPoint' | 'normal'>,
  stops: readonly (readonly [number, string])[],
): string {
  const { width: W, height: H } = size;
  const n = frame.normal;
  // CSS angles: 0deg points up, clockwise; direction = (sin θ, −cos θ).
  const theta = Math.atan2(n.x, -n.y);
  const length = Math.abs(W * Math.sin(theta)) + Math.abs(H * Math.cos(theta));
  const startX = W / 2 - (n.x * length) / 2;
  const startY = H / 2 - (n.y * length) / 2;
  const fold = (frame.foldPoint.x - startX) * n.x + (frame.foldPoint.y - startY) * n.y;
  const parts = stops.map(([at, color]) => `${color} ${round(fold + at)}px`);
  return `linear-gradient(${round((theta * 180) / Math.PI)}deg, ${parts.join(', ')})`;
}

/**
 * How rounded the fold looks (px): a flat crease at rest and when turned over, a wide roll
 * mid-turn, like paper curving under a hand.
 */
export function bendRadius({ width: W }: Size, progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return Math.round((4 + W * 0.09 * Math.sin(Math.PI * Math.min(1, p * 1.4))) * 100) / 100;
}
