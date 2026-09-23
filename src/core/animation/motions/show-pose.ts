import { defineMotion, str } from '../motion';
import { findPose, poseSwap } from './poses';

/**
 * Switches the character to one of its poses and keeps it (an empty choice switches back to
 * the character's own artwork). Poses are extra pictures uploaded in the Character panel.
 */
export const showPose = defineMotion({
  id: 'showPose',
  label: 'Show pose',
  kind: 'emphasis',
  holdEnd: true,
  defaults: { duration: 150, delay: 0, easing: 'linear', params: { pose: '' } },
  params: [{ key: 'pose', label: 'Pose', type: 'pose' }],
  tracks: (ctx) => {
    const id = str(ctx.params, 'pose', '');
    const index = id ? findPose(ctx.character, id) : -1;
    return { extra: poseSwap(index, [[0, 1]]) };
  },
});
