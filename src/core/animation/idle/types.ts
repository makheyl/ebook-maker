import type { Character, PageElement } from '../../schema/types';
import type { MotionTracks } from '../motion';

export type IdleContext = {
  element: PageElement;
  character: Character;
  intensity: number;
  /** Feet in element-local 0–1 coordinates. */
  pivot: { x: number; y: number };
};

/**
 * A looping idle motion for characters (breathing, floating…). Idle loops run on their own
 * layer, so story motions combine with them instead of replacing them.
 */
export type IdleMotion = {
  id: string;
  label: string;
  /** One cycle, in ms. */
  duration: number;
  /** Bends the character (turns on strip rendering). */
  warp?: boolean;
  build(ctx: IdleContext): MotionTracks;
};
