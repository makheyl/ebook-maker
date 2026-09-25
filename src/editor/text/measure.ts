import { buildText } from '@/core/render/nodes';
import type { TextElement } from '@/core/schema';

let host: HTMLDivElement | null = null;

function measureHost(): HTMLDivElement {
  if (host?.isConnected) return host;
  host = document.createElement('div');
  host.className = 'fl-page';
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    position: 'absolute',
    left: '-100000px',
    top: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
    width: 'auto',
    height: 'auto',
    overflow: 'visible',
    contain: 'none',
  });
  document.body.appendChild(host);
  return host;
}

/**
 * Height a text box needs to show all its content at its current width, measured with the
 * real renderer output (so it matches the stage and the exported book exactly).
 */
export function measureTextHeight(el: TextElement): number {
  const box = buildText(el, false, { measuring: true });
  box.style.position = 'relative';
  box.style.inset = 'auto';
  box.style.width = `${el.width}px`;
  box.style.height = 'auto';
  const h = measureHost();
  h.appendChild(box);
  const height = box.getBoundingClientRect().height;
  box.remove();
  return Math.ceil(height);
}

/** Grows (never shrinks) a text element so its content fits. Returns the height to use. */
export function fittedTextHeight(el: TextElement): number {
  return Math.max(el.height, measureTextHeight(el));
}
