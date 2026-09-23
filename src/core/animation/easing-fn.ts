import { EASINGS, resolveEasing } from './easing';

/**
 * JavaScript versions of the CSS easings, so values can be computed at any time (custom
 * keyframe tracks, "current value at the playhead"). They must match what the browser does.
 */
export type EasingFn = (t: number) => number;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** CSS cubic-bezier(x1, y1, x2, y2), solved for x with Newton's method and bisection. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFn {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  const solveX = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-7) return t;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-7) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };

  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return sampleY(solveX(x));
  };
}

type LinearStop = { value: number; at: number };

/** CSS linear(…) stops, with missing positions spread evenly as the spec requires. */
export function parseLinear(css: string): EasingFn {
  const body = css.slice(css.indexOf('(') + 1, css.lastIndexOf(')'));
  const raw = body.split(',').map((part) => part.trim().split(/\s+/));
  const stops: { value: number; at?: number }[] = [];
  for (const tokens of raw) {
    const value = Number(tokens[0]);
    const positions = tokens.slice(1).map((p) => Number.parseFloat(p) / 100);
    if (!positions.length) stops.push({ value });
    else positions.forEach((at) => stops.push({ value, at }));
  }
  if (stops[0] && stops[0].at === undefined) stops[0].at = 0;
  const last = stops[stops.length - 1];
  if (last && last.at === undefined) last.at = 1;
  // Clamp positions to be non-decreasing, then fill gaps evenly.
  let maxSoFar = 0;
  for (const s of stops) {
    if (s.at !== undefined) {
      s.at = Math.max(s.at, maxSoFar);
      maxSoFar = s.at;
    }
  }
  for (let i = 0; i < stops.length; i++) {
    if (stops[i]!.at !== undefined) continue;
    let j = i;
    while (stops[j]!.at === undefined) j++;
    const from = stops[i - 1]!.at!;
    const to = stops[j]!.at!;
    for (let k = i; k < j; k++) stops[k]!.at = from + ((to - from) * (k - i + 1)) / (j - i + 1);
    i = j;
  }
  const points = stops as LinearStop[];
  return (x) => {
    if (x <= points[0]!.at) return points[0]!.value;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      if (x <= b.at) {
        if (b.at === a.at) return b.value;
        return a.value + ((b.value - a.value) * (x - a.at)) / (b.at - a.at);
      }
    }
    return points[points.length - 1]!.value;
  };
}

const KEYWORDS: Record<string, EasingFn> = {
  linear: (t) => t,
  ease: cubicBezier(0.25, 0.1, 0.25, 1),
  'ease-in': cubicBezier(0.42, 0, 1, 1),
  'ease-out': cubicBezier(0, 0, 0.58, 1),
  'ease-in-out': cubicBezier(0.42, 0, 0.58, 1),
};

function parseCss(css: string): EasingFn {
  const trimmed = css.trim();
  if (KEYWORDS[trimmed]) return KEYWORDS[trimmed]!;
  if (trimmed.startsWith('linear(')) return parseLinear(trimmed);
  const bezier = /^cubic-bezier\(([^)]+)\)$/.exec(trimmed);
  if (bezier) {
    const [a, b, c, d] = bezier[1]!.split(',').map(Number);
    return cubicBezier(a!, b!, c!, d!);
  }
  const steps = /^steps\(\s*(\d+)\s*(?:,\s*([\w-]+))?\s*\)$/.exec(trimmed);
  if (steps) {
    const n = Number(steps[1]);
    const start = steps[2] === 'start' || steps[2] === 'jump-start';
    return (t) => clamp01((start ? Math.ceil(t * n) : Math.floor(t * n)) / n);
  }
  return KEYWORDS['ease-out']!;
}

const cache = new Map<string, EasingFn>();

/** A named easing (from EASINGS) or a raw CSS easing, as a function of 0–1 time. */
export function easingFunction(name: string | undefined): EasingFn {
  const key = name ?? 'linear';
  let fn = cache.get(key);
  if (!fn) {
    // Use the true curve (e.g. linear() bounce) even where the browser needs a fallback.
    const def = EASINGS.find((e) => e.id === key);
    fn = parseCss(def ? def.css : resolveEasing(key));
    cache.set(key, fn);
  }
  return fn;
}
