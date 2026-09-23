import type { KeyframeTrack, TrackKeyframe, TrackProperty } from '../schema/types';
import { easingFunction } from './easing-fn';
import type { MotionFrame } from './motion';

/** Value of a property when no track sets it. */
export const TRACK_DEFAULTS: Record<TrackProperty, number> = {
  x: 0,
  y: 0,
  rotate: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
};

/** Value of a track at normalized time `t` (0–1), using each segment's easing. */
export function evaluateTrack(keyframes: readonly TrackKeyframe[], t: number): number {
  const sorted = [...keyframes].sort((a, b) => a.t - b.t);
  const first = sorted[0]!;
  if (t <= first.t) return first.v;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    if (t <= b.t) {
      if (b.t === a.t) return b.v;
      const local = (t - a.t) / (b.t - a.t);
      return a.v + (b.v - a.v) * easingFunction(a.easing ?? 'linear')(local);
    }
  }
  return sorted[sorted.length - 1]!.v;
}

export const MAX_SAMPLES = 240;
const SAMPLES_PER_SECOND = 60;

/**
 * Compiles custom tracks into motion frames by sampling: every keyframe time plus an even
 * grid (≤ 60/s, ≤ 240 total), each property evaluated with its own easing, played back with
 * linear interpolation. Deterministic and seekable, and each track keeps independent easing.
 */
export function compileTracks(tracks: readonly KeyframeTrack[], durationMs: number): MotionFrame[] {
  const active = tracks.filter((t) => t.keyframes.length);
  if (!active.length) return [];
  const times = new Set<number>([0, 1]);
  for (const track of active) for (const k of track.keyframes) times.add(k.t);
  const grid = Math.min(
    MAX_SAMPLES,
    Math.max(2, Math.ceil((durationMs / 1000) * SAMPLES_PER_SECOND)),
  );
  for (let i = 1; i < grid; i++) times.add(i / grid);
  const offsets = [...times].sort((a, b) => a - b).slice(0, MAX_SAMPLES + active.length * 64);
  const byProperty = new Map(active.map((t) => [t.property, t.keyframes]));

  return offsets.map((offset) => {
    const frame: MotionFrame = { offset };
    for (const [property, keyframes] of byProperty) {
      frame[property] = evaluateTrack(keyframes, offset);
    }
    return frame;
  });
}

/** The current value of a property for a step's tracks (or the default when untracked). */
export function valueAt(
  tracks: readonly KeyframeTrack[] | undefined,
  property: TrackProperty,
  t: number,
): number {
  const track = tracks?.find((tr) => tr.property === property);
  return track?.keyframes.length ? evaluateTrack(track.keyframes, t) : TRACK_DEFAULTS[property];
}
