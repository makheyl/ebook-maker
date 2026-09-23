import { createAnimationStep } from '../../animation/factory';
import { createImageElement, createTextElement } from '../../schema/factories';
import { fitFontSize } from '../text-fit';
import type { LayoutTemplate } from '../types';

export const fullBleed: LayoutTemplate = {
  id: 'full-bleed',
  label: 'Full-page picture',
  description: 'Image fills the page, text overlaid',
  usesImage: true,
  build({ text, asset, pageSize: { width: W, height: H }, palette, fontId, animate }) {
    const m = Math.round(Math.min(W, H) * 0.06);
    const image = asset ? createImageElement(asset, { x: 0, y: 0, width: W, height: H }, {}, 'exact') : null;
    const pad = Math.round(m * 0.45);
    const box = { x: m, y: Math.round(H * 0.7), width: W - 2 * m, height: Math.round(H * 0.3) - m };
    const fontSize = fitFontSize(text, { width: box.width - pad * 2, height: box.height - pad * 2 }, {
      min: 18,
      max: Math.round(H * 0.055),
      lineHeight: 1.3,
    });
    const caption = createTextElement(text, box, {
      style: {
        fontFamily: fontId,
        fontSize,
        color: '#ffffff',
        align: 'center',
        verticalAlign: 'middle',
        lineHeight: 1.3,
        background: 'rgba(15, 12, 30, 0.55)',
        padding: pad,
        shadow: { x: 0, y: 2, blur: 8, color: 'rgba(0, 0, 0, 0.35)' },
      },
    });
    const elements = image ? [image, caption] : [caption];
    const animations = !animate
      ? []
      : [
          ...(image ? [createAnimationStep(image.id, 'kenBurns', 'onPageEnter')] : []),
          { ...createAnimationStep(caption.id, 'fadeIn', image ? 'withPrevious' : 'onPageEnter'), delay: 500 },
        ];
    return { background: { type: 'color', color: palette.background }, elements, animations };
  },
};
