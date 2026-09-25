import type { Draft } from 'immer';
import type { MusicTrack, Project } from '../schema/types';
import { cleanReferences } from './references';

export function addMusicTracks(draft: Draft<Project>, tracks: readonly MusicTrack[]): void {
  for (const t of tracks) draft.music.tracks[t.id] ??= { ...t };
}

export function renameMusicTrack(draft: Draft<Project>, id: string, name: string): void {
  const t = draft.music.tracks[id];
  const trimmed = name.trim().slice(0, 200);
  if (t && trimmed) t.name = trimmed;
}

/** Removes a track; sections that played it are removed too. */
export function removeMusicTrack(draft: Draft<Project>, id: string): void {
  delete draft.music.tracks[id];
  cleanReferences(draft);
}

/**
 * Music from a page on: a track, `null` to stop the music, or `undefined` to carry on with
 * what was playing before (removes the page's section). Keeps one section per page.
 */
export function setMusicSection(
  draft: Draft<Project>,
  pageId: string,
  trackId: string | null | undefined,
  volume?: number,
): void {
  const sections = draft.music.sections;
  const existing = sections.find((s) => s.fromPageId === pageId);
  if (trackId === undefined) {
    draft.music.sections = sections.filter((s) => s.fromPageId !== pageId);
    return;
  }
  if (trackId !== null && !draft.music.tracks[trackId]) return;
  if (existing) {
    existing.trackId = trackId;
    if (volume !== undefined) existing.volume = volume;
  } else if (sections.length < 50) {
    sections.push({ fromPageId: pageId, trackId, volume: volume ?? 0.6 });
  }
}

export function setMusicVolume(draft: Draft<Project>, pageId: string, volume: number): void {
  const s = draft.music.sections.find((x) => x.fromPageId === pageId);
  if (s) s.volume = Math.min(1, Math.max(0, volume));
}
