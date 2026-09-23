import { clampWeight, fontStack } from '../fonts/catalog';
import type { AssetRef, ImageElement, ShapeElement, TextElement } from '../schema/types';
import { imageLayout } from './image-geometry';
import { filterCss, textShadowCss } from './styles';

/**
 * Content builders for each element type. They only ever create nodes and set textContent /
 * attributes / CSSOM properties — user content is never parsed as HTML.
 */

export type AssetResolver = (assetId: string) => string | undefined;

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

// ─── Text ──────────────────────────────────────────────────────────────────────

/**
 * Builds the text box. With `splitChars`, every character is wrapped in its own span so
 * the typewriter animation can reveal them one by one; the full text is then exposed to
 * assistive tech through a visually hidden copy, and the per-character spans are hidden from it.
 */
export function buildText(element: TextElement, splitChars = false): HTMLElement {
  const s = element.style;
  const box = el('div', 'fl-text');
  box.style.fontFamily = fontStack(s.fontFamily);
  box.style.fontSize = `${s.fontSize}px`;
  box.style.fontWeight = String(clampWeight(s.fontFamily, s.fontWeight));
  box.style.fontStyle = s.italic ? 'italic' : 'normal';
  box.style.color = s.color;
  box.style.textAlign = s.align;
  box.style.justifyContent =
    s.verticalAlign === 'middle'
      ? 'center'
      : s.verticalAlign === 'bottom'
        ? 'flex-end'
        : 'flex-start';
  box.style.lineHeight = String(s.lineHeight);
  box.style.letterSpacing = `${s.letterSpacing}px`;
  box.style.padding = `${s.padding}px`;
  box.style.background = s.background ?? '';
  box.style.textShadow = textShadowCss(s.shadow);

  const inner = el('div', 'fl-text-inner');
  let charIndex = 0;
  for (const paragraph of element.content) {
    const p = el('p', 'fl-p');
    const hasText = paragraph.runs.some((r) => r.text.length > 0);
    if (!hasText) {
      p.appendChild(document.createElement('br'));
    }
    for (const run of paragraph.runs) {
      if (!run.text) continue;
      const span = el('span', 'fl-run');
      if (run.bold)
        span.style.fontWeight = String(clampWeight(s.fontFamily, Math.max(700, s.fontWeight)));
      if (run.italic) span.style.fontStyle = 'italic';
      if (run.underline) span.style.textDecoration = 'underline';
      if (run.color) span.style.color = run.color;
      if (splitChars) {
        for (const ch of Array.from(run.text)) {
          const c = el('span', 'fl-char');
          c.textContent = ch;
          c.dataset.i = String(charIndex++);
          span.appendChild(c);
        }
      } else {
        span.textContent = run.text;
      }
      p.appendChild(span);
    }
    inner.appendChild(p);
  }
  box.appendChild(inner);
  if (splitChars) {
    inner.setAttribute('aria-hidden', 'true');
    const sr = el('span', 'fl-sr-only');
    sr.textContent = element.content.map((p) => p.runs.map((r) => r.text).join('')).join('\n');
    box.appendChild(sr);
  }
  return box;
}

// ─── Image ─────────────────────────────────────────────────────────────────────

export function buildImage(
  element: ImageElement,
  asset: AssetRef | undefined,
  resolve: AssetResolver,
): HTMLElement {
  const box = el('div', 'fl-image');
  box.style.borderRadius = `${element.borderRadius}px`;
  const src = asset ? resolve(asset.id) : undefined;
  if (!asset || !src) {
    box.classList.add('fl-missing');
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', element.alt || 'Missing image');
    return box;
  }
  const flip = el('div', 'fl-image-flip');
  const sx = element.flipX ? -1 : 1;
  const sy = element.flipY ? -1 : 1;
  if (sx !== 1 || sy !== 1) flip.style.transform = `scale(${sx}, ${sy})`;

  const img = el('img', 'fl-img');
  img.draggable = false;
  img.decoding = 'async';
  img.alt = element.alt ?? '';
  img.src = src;
  const layout = imageLayout(asset, element.crop, element);
  img.style.left = `${layout.left}px`;
  img.style.top = `${layout.top}px`;
  img.style.width = `${layout.width}px`;
  img.style.height = `${layout.height}px`;
  const filter = filterCss(element.filters);
  if (filter) img.style.filter = filter;

  flip.appendChild(img);
  box.appendChild(flip);
  return box;
}

// ─── Shape ─────────────────────────────────────────────────────────────────────

export function buildShape(element: ShapeElement): SVGSVGElement {
  const { width: w, height: h, strokeWidth: sw } = element;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'fl-shape');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  let shape: SVGElement;
  if (element.shape === 'rect') {
    shape = document.createElementNS(SVG_NS, 'rect');
    const inset = element.stroke ? sw / 2 : 0;
    shape.setAttribute('x', String(inset));
    shape.setAttribute('y', String(inset));
    shape.setAttribute('width', String(Math.max(0, w - inset * 2)));
    shape.setAttribute('height', String(Math.max(0, h - inset * 2)));
    const r = Math.min(element.cornerRadius, w / 2, h / 2);
    shape.setAttribute('rx', String(r));
    shape.setAttribute('ry', String(r));
  } else if (element.shape === 'ellipse') {
    shape = document.createElementNS(SVG_NS, 'ellipse');
    const inset = element.stroke ? sw / 2 : 0;
    shape.setAttribute('cx', String(w / 2));
    shape.setAttribute('cy', String(h / 2));
    shape.setAttribute('rx', String(Math.max(0, w / 2 - inset)));
    shape.setAttribute('ry', String(Math.max(0, h / 2 - inset)));
  } else {
    shape = document.createElementNS(SVG_NS, 'line');
    shape.setAttribute('x1', '0');
    shape.setAttribute('y1', String(h / 2));
    shape.setAttribute('x2', String(w));
    shape.setAttribute('y2', String(h / 2));
    shape.setAttribute('stroke-linecap', 'round');
  }
  shape.style.fill = element.shape === 'line' ? 'none' : element.fill;
  if (element.stroke && sw > 0) {
    shape.style.stroke = element.stroke;
    shape.style.strokeWidth = String(sw);
  }
  svg.appendChild(shape);
  return svg;
}
