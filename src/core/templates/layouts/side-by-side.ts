import { createAnimationStep } from '../../animation/factory';
import { createImageElement, createTextElement } from '../../schema/factories';
import { fitFontSize } from '../text-fit';
import type { LayoutTemplate } from '../types';

export const sideBySide: LayoutTemplate = {
  id: 'side-by-side',
  label: 'Side by side',
  description: 'Image and text next to each other',
  usesImage: true,
  build({ text, asset, pageSize: { width: W, height: H }, palette, fontId, animate }) {
    const m = Math.round(Math.min(W, H) * 0.06);
    // Landscape pages split left/right; portrait pages split top/bottom.
    const landscape = W >= H;
    const imageBox = landscape ? { x: 0, y: 0, width: Math.round(W / 2), height: H } : { x: 0, y: 0, width: W, height: Math.round(H / 2) };
    const textBox = landscape
      ? { x: Math.round(W / 2) + m, y: m, width: Math.round(W / 2) - 2 * m, height: H - 2 * m }
      : { x: m, y: Math.round(H / 2) + m, width: W - 2 * m, height: Math.round(H / 2) - 2 * m };
    const image = asset ? createImageElement(asset, imageBox, {}, 'exact') : null;
    const fontSize = fitFontSize(text, textBox, { min: 18, max: Math.round(H * 0.07), lineHeight: 1.35 });
    const caption = createTextElement(text, textBox, {
      style: { fontFamily: fontId, fontSize, color: palette.text, align: 'left', verticalAlign: 'middle', lineHeight: 1.35 },
    });
    const elements = image ? [image, caption] : [caption];
    const animations = !animate
      ? []
      : [
          ...(image ? [createAnimationStep(image.id, 'fadeIn', 'onPageEnter')] : []),
          createAnimationStep(caption.id, 'slideLeft', image ? 'withPrevious' : 'onPageEnter'),
        ];
    return { background: { type: 'color', color: palette.background }, elements, animations };
  },
};
