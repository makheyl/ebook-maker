import type { ImageFilters, PageBackground, TextShadow } from '../schema/types';

/** CSS `filter` for non-destructive image adjustments; empty string when nothing is applied. */
export function filterCss(f: ImageFilters): string {
  const parts: string[] = [];
  if (f.brightness !== 1) parts.push(`brightness(${f.brightness})`);
  if (f.contrast !== 1) parts.push(`contrast(${f.contrast})`);
  if (f.saturate !== 1) parts.push(`saturate(${f.saturate})`);
  if (f.grayscale) parts.push(`grayscale(${f.grayscale})`);
  if (f.sepia) parts.push(`sepia(${f.sepia})`);
  if (f.hueRotate) parts.push(`hue-rotate(${f.hueRotate}deg)`);
  if (f.blur) parts.push(`blur(${f.blur}px)`);
  return parts.join(' ');
}

export function textShadowCss(shadow: TextShadow | undefined): string {
  return shadow ? `${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.color}` : '';
}

/** CSS background for color and gradient backgrounds (image backgrounds render an <img>). */
export function backgroundCss(bg: PageBackground): string {
  switch (bg.type) {
    case 'color':
      return bg.color;
    case 'gradient':
      return `linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})`;
    case 'image':
      return bg.color;
  }
}
