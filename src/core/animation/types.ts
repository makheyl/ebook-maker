import type { AnimationKind, ElementType, PageElement, PageSize } from '../schema/types';

export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

/** UI hints for a preset parameter (rendered by the Animation Pane). */
export type ParamDef =
  | {
      key: string;
      label: string;
      type: 'number';
      min: number;
      max: number;
      step: number;
      unit?: string;
    }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[] };

/**
 * What to animate and how. `target`:
 * - 'element' → the element's animation layer (.fl-anim)
 * - 'chars'   → each character span of a split text element, staggered across the duration
 * - 'media'   → the <img> inside an image element (e.g. Ken Burns, clipped by the frame)
 */
export type KeyframeSpec = {
  target: 'element' | 'chars' | 'media';
  keyframes: Keyframe[];
  /** Per-target duration as a fraction of the step duration (chars); default 1. */
  durationFraction?: number;
  iterations?: number;
  /** Overrides the step easing (e.g. 'linear' for character reveals). */
  easing?: string;
};

export type BuildContext = {
  element: PageElement;
  params: Params;
  pageSize: PageSize;
};

/**
 * An animation preset. Adding a new animation = adding one file that exports one of these
 * and listing it in presets/index.ts.
 */
export type AnimationPreset = {
  id: string;
  label: string;
  kind: AnimationKind;
  /** Element types it can be applied to (default: all). */
  appliesTo?: readonly ElementType[];
  /** Needs text split into per-character spans (the renderer does this). */
  splitText?: 'chars';
  /**
   * How the effect persists: entrances hold their start state before playing (hidden until
   * they run) and their end state after; exits only hold their end state; emphasis effects
   * return to normal unless `holdEnd` is set.
   */
  holdEnd?: boolean;
  defaults: { duration: number; delay: number; easing: string; params?: Params };
  params?: readonly ParamDef[];
  build(ctx: BuildContext): KeyframeSpec[];
};
