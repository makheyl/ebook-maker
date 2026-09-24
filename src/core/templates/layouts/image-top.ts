import { createAnimationStep } from '../../animation/factory';
import { createImageElement, createTextElement } from '../../schema/factories';
import { fitFontSize } from '../text-fit';
import type { LayoutTemplate } from '../types';

export const imageTop: LayoutTemplate = {
  id: 'image-top',
  label: 'Picture on top',
  description: 'Image above, text below',
  usesImage: true,
  build({ text, asset, pageSize: { width: W, height: H }, palette, fontId, animate }) {
    const m = Math.round(Math.min(W, H) * 0.05);
    const imageH = Math.round(H * 0.64);
    const image = asset
      ? createImageElement(
          asset,
          { x: m, y: m, width: W - 2 * m, height: imageH - m },
          { borderRadius: Math.round(m * 0.4) },
          'exact',
        )
      : null;
    const box = { x: m * 2, y: imageH + m, width: W - 4 * m, height: H - imageH - 2 * m };
    const fontSize = fitFontSize(text, box, {
      min: 18,
      max: Math.round(H * 0.06),
      lineHeight: 1.3,
    });
    const caption = createTextElement(text, box, {
      style: {
        // Captions keep their layout box; long text shrinks to fit it.
        autofit: 'shrink',
        fontFamily: fontId,
        fontSize,
        color: palette.text,
        align: 'center',
        verticalAlign: 'middle',
        lineHeight: 1.3,
      },
    });
    const elements = image ? [image, caption] : [caption];
    const animations = !animate
      ? []
      : [
          ...(image ? [createAnimationStep(image.id, 'fadeIn', 'onPageEnter')] : []),
          {
            ...createAnimationStep(caption.id, 'slideUp', image ? 'afterPrevious' : 'onPageEnter'),
            delay: 100,
          },
        ];
    return { background: { type: 'color', color: palette.background }, elements, animations };
  },
};
