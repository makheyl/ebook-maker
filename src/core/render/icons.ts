import type { ButtonIcon } from '../schema/types';

/** Built-in button icons (24×24). A closed set: user content never becomes SVG markup. */
export const BUTTON_ICON_PATHS: Record<ButtonIcon, { d: string; filled?: boolean }> = {
  arrowRight: { d: 'M5 12h14M13 6l6 6-6 6' },
  arrowLeft: { d: 'M19 12H5M11 18l-6-6 6-6' },
  home: { d: 'M3 11l9-8 9 8M5 10v10h14V10' },
  restart: { d: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5' },
  star: {
    d: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3l-5.5 2.9 1-6.2L3 9.6l6.2-.9z',
    filled: true,
  },
  heart: {
    d: 'M12 20s-7-4.4-9-8.5C1.6 8.3 3.6 5 7 5c2 0 3.4 1.2 5 3 1.6-1.8 3-3 5-3 3.4 0 5.4 3.3 4 6.5-2 4.1-9 8.5-9 8.5z',
    filled: true,
  },
  question: {
    d: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  },
  check: { d: 'M20 6 9 17l-5-5' },
  play: { d: 'M7 4v16l13-8z', filled: true },
  soundOn: { d: 'M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14' },
  soundOff: { d: 'M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6' },
  paw: {
    d: 'M8 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM16 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM4.5 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM19.5 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 11c-3 0-6 4-6 7 0 2 2 3 3.5 2.5S11 19 12 19s1.5 1 2.5 1.5S18 20 18 18c0-3-3-7-6-7z',
    filled: true,
  },
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export function buildIcon(name: ButtonIcon, className: string): SVGSVGElement {
  const def = BUTTON_ICON_PATHS[name];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', def.d);
  path.setAttribute('fill', def.filled ? 'currentColor' : 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', def.filled ? '1' : '2.25');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}
