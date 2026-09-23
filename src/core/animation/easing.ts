/**
 * Named easings → CSS easing functions understood by the Web Animations API.
 * Bounce and elastic use CSS `linear()`, with a cubic-bezier fallback for older browsers.
 */
export type EasingDef = { id: string; label: string; css: string; fallback?: string };

const BOUNCE =
  'linear(0, 0.063, 0.25 18.2%, 0.563, 1 36.4%, 0.813, 0.75 45.5%, 0.813, 1 54.5%, 0.938, 0.875 63.6%, 0.938, 1 72.7%, 0.984, 1 81.8%, 1)';
const ELASTIC =
  'linear(0, 0.218 2.1%, 0.862 6.5%, 1.114, 1.296 10.7%, 1.346, 1.37 12.9%, 1.373, 1.364 15%, 1.297 17.1%, 1.043 22.3%, 0.967 24.5%, 0.895, 0.87 29.5%, 0.874, 0.89 33.2%, 0.975 38.2%, 1.013 42.6%, 1.022 45.1%, 1.019 48.1%, 0.997 56.2%, 0.99 60.8%, 1.002 72.7%, 1)';

export const EASINGS: readonly EasingDef[] = [
  { id: 'easeOut', label: 'Ease out', css: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  { id: 'easeInOut', label: 'Ease in-out', css: 'cubic-bezier(0.65, 0, 0.35, 1)' },
  { id: 'easeIn', label: 'Ease in', css: 'cubic-bezier(0.64, 0, 0.78, 0)' },
  { id: 'linear', label: 'Linear', css: 'linear' },
  { id: 'backOut', label: 'Overshoot', css: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
  { id: 'backIn', label: 'Anticipate', css: 'cubic-bezier(0.36, 0, 0.66, -0.56)' },
  { id: 'bounce', label: 'Bounce', css: BOUNCE, fallback: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
  { id: 'elastic', label: 'Elastic', css: ELASTIC, fallback: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
];

const byId = new Map(EASINGS.map((e) => [e.id, e]));
let linearSupported: boolean | undefined;

function supportsLinear(): boolean {
  if (linearSupported === undefined) {
    linearSupported =
      typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
        ? CSS.supports('transition-timing-function', 'linear(0, 1)')
        : false;
  }
  return linearSupported;
}

/** Resolves a named easing (or passes through a raw CSS easing) to a WAAPI easing string. */
export function resolveEasing(name: string): string {
  const def = byId.get(name);
  if (!def) return /^(linear|ease(-in|-out|-in-out)?|cubic-bezier\([\d.,\s-]+\)|steps\([\w\s,-]+\))$/.test(name) ? name : 'ease-out';
  if (def.css.startsWith('linear(') && !supportsLinear()) return def.fallback ?? 'ease-out';
  return def.css;
}
