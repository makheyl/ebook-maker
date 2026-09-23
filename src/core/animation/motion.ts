import type { Character, PageElement } from '../schema/types';
import { resolveEasing } from './easing';
import type { AnimationPreset, BuildContext, KeyframeSpec, Params } from './types';

/**
 * Structured motion: keyframes as properties (x, y, rotate, scale…) rather than CSS strings.
 * Character motions are authored this way so they can be shown and edited on the timeline,
 * baked into custom keyframes, and coupled to the ground shadow automatically.
 */
export type MotionFrame = {
  offset: number;
  x?: number;
  y?: number;
  rotate?: number;
  scaleX?: number;
  scaleY?: number;
  opacity?: number;
  /** Easing from this frame to the next (named or CSS). */
  easing?: string;
};

export type MotionTracks = {
  element?: MotionFrame[];
  idle?: MotionFrame[];
  /** Horizontal facing, as scaleX of the flip layer (−1 = mirrored). */
  face?: { offset: number; scaleX: number; easing?: string }[];
  /** Extra specs for strips / poses. */
  extra?: KeyframeSpec[];
};

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Fixed order so every motion composes the same way: translate → rotate → scale. */
export function compileTransform(f: MotionFrame): string {
  const x = f.x ?? 0;
  const y = f.y ?? 0;
  const r = f.rotate ?? 0;
  const sx = f.scaleX ?? 1;
  const sy = f.scaleY ?? 1;
  return `translate(${round(x)}px, ${round(y)}px) rotate(${round(r)}deg) scale(${round(sx)}, ${round(sy)})`;
}

export function compileFrames(frames: readonly MotionFrame[]): Keyframe[] {
  const withOpacity = frames.some((f) => f.opacity !== undefined);
  return frames.map((f) => {
    const kf: Keyframe = { offset: f.offset, transform: compileTransform(f) };
    if (withOpacity) kf.opacity = f.opacity ?? 1;
    if (f.easing) kf.easing = resolveEasing(f.easing);
    return kf;
  });
}

/**
 * The ground shadow follows the character horizontally and shrinks/fades as it rises, so
 * every hop and float reads as leaving the ground. Derived from the motion, never authored.
 */
export function shadowFrames(
  frames: readonly MotionFrame[],
  element: Pick<PageElement, 'height'>,
  character: Character,
): Keyframe[] {
  const withOpacity = frames.some((f) => f.opacity !== undefined);
  return frames.map((f) => {
    const lift = Math.max(0, -(f.y ?? 0)) / Math.max(1, element.height);
    const scale = Math.max(0.35, 1 - lift * 1.4);
    const fade = Math.max(0.25, 1 - lift * 1.6) * (withOpacity ? (f.opacity ?? 1) : 1);
    const kf: Keyframe = {
      offset: f.offset,
      transform: `translateX(${round(f.x ?? 0)}px) scale(${round(scale * (f.scaleX ?? 1))})`,
      opacity: round(character.shadow.opacity * fade),
    };
    if (f.easing) kf.easing = resolveEasing(f.easing);
    return kf;
  });
}

/** Turns structured tracks into the runtime's keyframe specs (adding the shadow). */
export function compileMotion(tracks: MotionTracks, ctx: BuildContext): KeyframeSpec[] {
  const specs: KeyframeSpec[] = [];
  if (tracks.element?.length) {
    specs.push({ target: 'element', keyframes: compileFrames(tracks.element) });
    if (ctx.character?.shadow.enabled) {
      specs.push({
        target: 'shadow',
        keyframes: shadowFrames(tracks.element, ctx.element, ctx.character),
      });
    }
  }
  if (tracks.idle?.length) {
    specs.push({ target: 'idle', keyframes: compileFrames(tracks.idle) });
    if (ctx.character?.shadow.enabled && tracks.idle.some((f) => (f.y ?? 0) !== 0)) {
      specs.push({
        target: 'shadow',
        keyframes: shadowFrames(tracks.idle, ctx.element, ctx.character),
      });
    }
  }
  if (tracks.face?.length) {
    const flipY = ctx.element.type === 'image' && ctx.element.flipY ? -1 : 1;
    specs.push({
      target: 'face',
      keyframes: tracks.face.map((f) => ({
        offset: f.offset,
        transform: `scale(${round(f.scaleX)}, ${flipY})`,
        ...(f.easing ? { easing: resolveEasing(f.easing) } : {}),
      })),
    });
  }
  if (tracks.extra) specs.push(...tracks.extra);
  return specs;
}

export type MotionDefinition = Omit<AnimationPreset, 'build' | 'requiresCharacter'> & {
  tracks(ctx: BuildContext & { character: Character }): MotionTracks;
};

/** Declares a character motion as a regular preset (so steps and the pane can use it). */
export function defineMotion(def: MotionDefinition): AnimationPreset & {
  tracks: MotionDefinition['tracks'];
} {
  const { tracks, ...rest } = def;
  return {
    ...rest,
    tracks,
    appliesTo: ['image'],
    requiresCharacter: true,
    build: (ctx) =>
      ctx.character ? compileMotion(tracks({ ...ctx, character: ctx.character }), ctx) : [],
  };
}

/** Reads a numeric param with a default. */
export function num(params: Params, key: string, fallback: number): number {
  const v = params[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Reads a string param with a default. */
export function str(params: Params, key: string, fallback: string): string {
  const v = params[key];
  return typeof v === 'string' ? v : fallback;
}
