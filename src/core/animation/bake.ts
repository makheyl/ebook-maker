import type { KeyframeTrack, TrackProperty } from '../schema/types';
import type { MotionFrame, MotionTracks } from './motion';
import { getPreset } from './presets';
import type { BuildContext } from './types';
import { TRACK_DEFAULTS } from './tracks';

type TracksFn = (
  ctx: BuildContext & { character: NonNullable<BuildContext['character']> },
) => MotionTracks;

/** Whether a structured motion can become editable keyframes (only whole-body moves can). */
export function canBake(tracks: MotionTracks): boolean {
  return (
    !!tracks.element?.length &&
    !tracks.face &&
    !tracks.extra?.length &&
    !tracks.elementOrigin &&
    !tracks.element.some((f) => f.clipBottom !== undefined)
  );
}

/** Turns motion frames into custom keyframe tracks (one per property the motion uses). */
// Derived from TRACK_DEFAULTS (not the zod schema) so the reader bundle stays zod-free.
const PROPERTIES = Object.keys(TRACK_DEFAULTS) as TrackProperty[];

export function framesToTracks(frames: readonly MotionFrame[]): KeyframeTrack[] {
  const used = PROPERTIES.filter((p) => frames.some((f) => f[p] !== undefined));
  return used.map((property: TrackProperty) => ({
    property,
    keyframes: frames.slice(0, 64).map((f) => ({
      t: Math.min(1, Math.max(0, f.offset)),
      v: f[property] ?? TRACK_DEFAULTS[property],
      ...(f.easing ? { easing: f.easing } : {}),
    })),
  }));
}

/** The keyframe tracks for a character motion step, or null when it can't be converted. */
export function bakeStep(ctx: BuildContext): KeyframeTrack[] | null {
  const preset = getPreset(ctx.step?.preset ?? '') as { tracks?: TracksFn } | undefined;
  if (!preset?.tracks || !ctx.character) return null;
  const params = { ...getPreset(ctx.step!.preset)!.defaults.params, ...ctx.step!.params };
  const tracks = preset.tracks({ ...ctx, params, character: ctx.character });
  return canBake(tracks) ? framesToTracks(tracks.element!) : null;
}
