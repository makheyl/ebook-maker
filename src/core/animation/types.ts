import type {
  AnimationKind,
  AnimationStep,
  Character,
  ElementType,
  PageElement,
  PageSize,
} from '../schema/types';

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
 * - 'idle'    → a character's idle layer (.fl-idle)
 * - 'face'    → a character's flip layer (turning around)
 * - 'shadow'  → a character's ground shadow
 * - 'strips'  → each strip of a warped character (keyframes come from `perTarget`)
 * - 'poses'   → each pose image of a character (keyframes come from `perTarget`)
 */
export type KeyframeTarget =
  'element' | 'chars' | 'media' | 'idle' | 'face' | 'shadow' | 'strips' | 'poses';

export type KeyframeSpec = {
  target: KeyframeTarget;
  keyframes: Keyframe[];
  /** Keyframes for the i-th of n targets (strips, poses); overrides `keyframes`. */
  perTarget?: (index: number, count: number) => Keyframe[];
  /** Per-target duration as a fraction of the step duration (chars); default 1. */
  durationFraction?: number;
  iterations?: number;
  /** 'add' layers the effect on top of others on the same target (e.g. a bend over the sway idle). */
  composite?: CompositeOperation;
  /** Overrides the step easing (e.g. 'linear' for character reveals). */
  easing?: string;
};

export type BuildContext = {
  element: PageElement;
  params: Params;
  pageSize: PageSize;
  /** Set when the element is a character instance. */
  character?: Character;
  /** The character's feet in element-local 0–1 coordinates. */
  pivot?: { x: number; y: number };
  /** The step being built (custom keyframe tracks live on it). */
  step?: AnimationStep;
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
  /** Overrides the fill mode derived from `kind`/`holdEnd`. */
  fill?: FillMode;
  /** Only for character instances (listed under "Character" in the Animation Pane). */
  requiresCharacter?: boolean;
  /** Needs the character rendered as strips (bending motions). */
  warp?: boolean;
  defaults: { duration: number; delay: number; easing: string; params?: Params };
  params?: readonly ParamDef[];
  build(ctx: BuildContext): KeyframeSpec[];
};
