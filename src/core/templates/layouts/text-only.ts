import { createAnimationStep } from '../../animation/factory';
import { createTextElement } from '../../schema/factories';
import { fitFontSize } from '../text-fit';
import type { LayoutTemplate } from '../types';

export const textOnly: LayoutTemplate = {
  id: 'text-only',
  label: 'Words only',
  description: 'Big centered text',
  usesImage: false,
  build({ text, pageSize: { width: W, height: H }, palette, fontId, animate }) {
    const m = Math.round(Math.min(W, H) * 0.12);
    const box = { x: m, y: m, width: W - 2 * m, height: H - 2 * m };
    const fontSize = fitFontSize(text, box, {
      min: 20,
      max: Math.round(H * 0.09),
      lineHeight: 1.25,
    });
    const caption = createTextElement(text, box, {
      style: {
        fontFamily: fontId,
        fontSize,
        color: palette.text,
        align: 'center',
        verticalAlign: 'middle',
        lineHeight: 1.25,
        fontWeight: 600,
      },
    });
    return {
      background: { type: 'color', color: palette.background },
      elements: [caption],
      animations: animate ? [createAnimationStep(caption.id, 'fadeIn', 'onPageEnter')] : [],
    };
  },
};
