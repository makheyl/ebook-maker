import { defineMotion, num, str } from '../motion';
import { faceToward, offPage, type Side } from './helpers';

/** Slides in from the nearest edge and stops partly hidden — "who's there?" */
export const peekIn = defineMotion({
  id: 'peekIn',
  label: 'Peek in',
  kind: 'entrance',
  holdEnd: true,
  defaults: { duration: 900, delay: 0, easing: 'linear', params: { from: 'auto', amount: 0.45 } },
  params: [
    {
      key: 'from',
      label: 'From',
      type: 'select',
      options: [
        { value: 'auto', label: 'Nearest edge' },
        { value: 'left', label: 'The left' },
        { value: 'right', label: 'The right' },
      ],
    },
    { key: 'amount', label: 'Visible', type: 'number', min: 0.2, max: 0.9, step: 0.05 },
  ],
  tracks: (ctx) => {
    const el = ctx.element;
    const choice = str(ctx.params, 'from', 'auto');
    const side: Side =
      choice === 'left' || choice === 'right'
        ? choice
        : el.x + el.width / 2 < ctx.pageSize.width / 2
          ? 'left'
          : 'right';
    const amount = Math.min(0.9, Math.max(0.2, num(ctx.params, 'amount', 0.45)));
    const final =
      side === 'left'
        ? -(el.x + el.width * (1 - amount))
        : ctx.pageSize.width - el.x - el.width * amount;
    const toward: Side = side === 'left' ? 'right' : 'left';
    return {
      element: [
        { offset: 0, x: offPage(ctx, side), easing: 'easeOut' },
        { offset: 0.8, x: final + (toward === 'right' ? 8 : -8), easing: 'easeInOut' },
        { offset: 1, x: final },
      ],
      face: [
        { offset: 0, scaleX: faceToward(ctx, toward) },
        { offset: 1, scaleX: faceToward(ctx, toward) },
      ],
    };
  },
});
