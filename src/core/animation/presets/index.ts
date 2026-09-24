import type { AnimationKind, ElementType } from '../../schema/types';
import { CHARACTER_MOTIONS } from '../motions';
import type { AnimationPreset } from '../types';
import { popFromTail, popToTail, wobble } from './bubble';
import { fadeIn } from './fade-in';
import { fadeOut } from './fade-out';
import { kenBurns } from './ken-burns';
import { liftUp } from './lift-up';
import { keyframesPreset } from './keyframes';
import { popIn } from './pop-in';
import { pulse } from './pulse';
import { slideLeft } from './slide-left';
import { slideOutDown } from './slide-out-down';
import { slideUp } from './slide-up';
import { typewriter } from './typewriter';
import { zoomIn } from './zoom-in';

/** The preset registry. To add an animation, create a file in this folder and list it here. */
export const ANIMATION_PRESETS: readonly AnimationPreset[] = [
  fadeIn,
  slideUp,
  slideLeft,
  zoomIn,
  popIn,
  popFromTail,
  typewriter,
  kenBurns,
  pulse,
  wobble,
  fadeOut,
  slideOutDown,
  liftUp,
  popToTail,
  keyframesPreset,
  ...CHARACTER_MOTIONS,
];

const byId = new Map(ANIMATION_PRESETS.map((p) => [p.id, p]));

export function getPreset(id: string): AnimationPreset | undefined {
  return byId.get(id);
}

/** Presets offered for an element in the Animation Pane (custom moves are made on the timeline). */
export function presetsFor(
  kind: AnimationKind,
  type: ElementType,
  isCharacter = false,
): AnimationPreset[] {
  return ANIMATION_PRESETS.filter(
    (p) =>
      p.kind === kind &&
      p.id !== 'keyframes' &&
      (!p.appliesTo || p.appliesTo.includes(type)) &&
      (!p.requiresCharacter || isCharacter),
  );
}
