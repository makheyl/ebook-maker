import { defineMotion, num } from '../motion';
import { intensityParam, squash, stretch } from './helpers';
import { findPose, flaps, poseSwap } from './poses';

/** A pose whose name suggests an open mouth. */
export const TALK_POSE = /talk|mouth|speak|open/i;

/**
 * Chatters: tiny rhythmic squash and stretch while speaking (loop it for longer lines). With a
 * "talk" pose (e.g. mouth open) the character also flips between its artwork and that pose.
 */
export const talk = defineMotion({
  id: 'talk',
  label: 'Talk',
  kind: 'emphasis',
  defaults: { duration: 1200, delay: 0, easing: 'linear', params: { intensity: 1 } },
  params: [intensityParam],
  tracks: (ctx) => {
    const k = num(ctx.params, 'intensity', 1);
    const seq = [
      stretch(0.03 * k),
      squash(0.02 * k),
      stretch(0.025 * k),
      squash(0.01 * k),
      stretch(0.02 * k),
    ];
    const pose = findPose(ctx.character, TALK_POSE);
    const duration = ctx.step?.duration ?? 1200;
    return {
      element: [
        { offset: 0, scaleX: 1, scaleY: 1, easing: 'easeInOut' },
        ...seq.map((s, i) => ({ offset: (i + 1) / (seq.length + 1), ...s, easing: 'easeInOut' })),
        { offset: 1, scaleX: 1, scaleY: 1 },
      ],
      // About 7 mouth flaps a second, whatever the duration.
      extra:
        pose >= 0 ? poseSwap(pose, flaps(Math.max(1, Math.round(duration / 150)), 0.5)) : undefined,
    };
  },
});
