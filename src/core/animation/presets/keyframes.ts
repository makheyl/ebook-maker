import { compileFrames, shadowFrames } from '../motion';
import { compileTracks } from '../tracks';
import type { AnimationPreset, KeyframeSpec } from '../types';

/**
 * A custom move: the step's own keyframe tracks (edited on the timeline, or baked from a
 * character motion). Holds its first values before it starts and its last values after.
 */
export const keyframesPreset: AnimationPreset = {
  id: 'keyframes',
  label: 'Custom move',
  kind: 'emphasis',
  fill: 'both',
  defaults: { duration: 1500, delay: 0, easing: 'linear' },
  build: ({ step, element, character }) => {
    const frames = compileTracks(step?.tracks ?? [], step?.duration ?? 1000);
    if (!frames.length) return [];
    const specs: KeyframeSpec[] = [{ target: 'element', keyframes: compileFrames(frames) }];
    if (character?.shadow.enabled) {
      specs.push({ target: 'shadow', keyframes: shadowFrames(frames, element, character) });
    }
    return specs;
  },
};
