import { clampInt, type MotionContext } from './helpers';
import { defineMotion, num } from '../motion';
import { findPose, poseSwap } from './poses';

/** A pose whose name suggests closed eyes. */
export const BLINK_POSE = /blink|closed|eyes|sleep/i;

/**
 * Blinks. Uses the character's "blink" pose (eyes closed) when it has one; otherwise it's a
 * quick little squint of the whole body.
 */
export const blink = defineMotion({
  id: 'blink',
  label: 'Blink',
  kind: 'emphasis',
  defaults: { duration: 500, delay: 0, easing: 'easeInOut', params: { times: 1 } },
  params: [{ key: 'times', label: 'Blinks', type: 'number', min: 1, max: 3, step: 1 }],
  tracks: (ctx: MotionContext) => {
    const times = clampInt(num(ctx.params, 'times', 1), 1, 3);
    const pose = findPose(ctx.character, BLINK_POSE);
    const slot = 1 / times;
    const windows = Array.from({ length: times }, (_, i): [number, number] => [
      Math.round((i + 0.3) * slot * 1000) / 1000,
      Math.round((i + 0.65) * slot * 1000) / 1000,
    ]);
    return {
      element: [
        { offset: 0, scaleY: 1, scaleX: 1 },
        ...windows.flatMap(([a, b]) => [
          { offset: a, scaleY: 1, scaleX: 1 },
          { offset: (a + b) / 2, scaleY: pose >= 0 ? 0.995 : 0.97, scaleX: 1.01 },
          { offset: b, scaleY: 1, scaleX: 1 },
        ]),
        { offset: 1, scaleY: 1, scaleX: 1 },
      ],
      extra: pose >= 0 ? poseSwap(pose, windows) : undefined,
    };
  },
});
