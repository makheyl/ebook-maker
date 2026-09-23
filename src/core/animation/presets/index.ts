import type { AnimationKind, ElementType } from '../../schema/types';
import type { AnimationPreset } from '../types';
import { fadeIn } from './fade-in';
import { fadeOut } from './fade-out';
import { kenBurns } from './ken-burns';
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
  typewriter,
  kenBurns,
  pulse,
  fadeOut,
  slideOutDown,
];

const byId = new Map(ANIMATION_PRESETS.map((p) => [p.id, p]));

export function getPreset(id: string): AnimationPreset | undefined {
  return byId.get(id);
}

export function presetsFor(kind: AnimationKind, type: ElementType): AnimationPreset[] {
  return ANIMATION_PRESETS.filter((p) => p.kind === kind && (!p.appliesTo || p.appliesTo.includes(type)));
}
