import { defineMotion, num, str } from '../motion';
import { stripKeyframes } from '../warp';
import { facing, intensityParam } from './helpers';

/** Bends toward one side (curious, listening, reaching) and stays leaning. */
export const lean = defineMotion({
  id: 'lean',
  label: 'Lean',
  kind: 'emphasis',
  warp: true,
  holdEnd: true,
  defaults: {
    duration: 700,
    delay: 0,
    easing: 'linear',
    params: { toward: 'facing', intensity: 1 },
  },
  params: [
    {
      key: 'toward',
      label: 'Toward',
      type: 'select',
      options: [
        { value: 'facing', label: 'Where it looks' },
        { value: 'left', label: 'The left' },
        { value: 'right', label: 'The right' },
      ],
    },
    intensityParam,
  ],
  tracks: (ctx) => {
    const choice = str(ctx.params, 'toward', 'facing');
    const side = choice === 'left' || choice === 'right' ? choice : facing(ctx);
    const amplitude =
      ctx.element.width * 0.1 * num(ctx.params, 'intensity', 1) * (side === 'right' ? 1 : -1);
    return {
      extra: [
        {
          target: 'strips',
          keyframes: [],
          composite: 'add',
          perTarget: stripKeyframes(ctx.element.height, ctx.pivot?.y ?? 1, amplitude, [
            { offset: 0, sway: 0, easing: 'backOut' },
            { offset: 1, sway: 1 },
          ]),
        },
      ],
    };
  },
});
