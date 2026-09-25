import type { AudioMix } from '../schema/types';

/** As recorded: full volume, no fades, no trim. */
export const DEFAULT_MIX: AudioMix = { volume: 1, fadeInMs: 0, fadeOutMs: 0, trimStartMs: 0 };

/** How long a clip plays (ms): from its in-point to its out-point, or the end of the file. */
export function playLength(mix: AudioMix, fileMs: number | undefined): number | undefined {
  const end = mix.trimEndMs ?? fileMs;
  if (end === undefined) return undefined;
  return Math.max(0, end - mix.trimStartMs);
}

/**
 * The clip's gain at `t` ms after it started (pure; the reader and the editor both use it):
 * its volume, shaped by the fade in and the fade out before its end.
 */
export function gainAt(mix: AudioMix, t: number, length: number | undefined): number {
  let g = mix.volume;
  if (mix.fadeInMs > 0 && t < mix.fadeInMs) g *= Math.max(0, t) / mix.fadeInMs;
  if (length !== undefined && mix.fadeOutMs > 0) {
    const left = length - t;
    if (left < mix.fadeOutMs) g *= Math.max(0, left) / mix.fadeOutMs;
  }
  return Math.min(1, Math.max(0, g));
}

/** Fades never take more than the clip itself (each at most half when both are set). */
export function clampMix(mix: AudioMix, length: number | undefined): AudioMix {
  if (length === undefined) return mix;
  const half = mix.fadeInMs && mix.fadeOutMs ? length / 2 : length;
  return {
    ...mix,
    fadeInMs: Math.round(Math.min(mix.fadeInMs, half)),
    fadeOutMs: Math.round(Math.min(mix.fadeOutMs, half)),
  };
}
