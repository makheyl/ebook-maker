import type { Project } from '../schema/types';

export type MusicSection = { trackId: string | null; volume: number; fromIndex: number };

/**
 * The music for a page: the last section starting at or before it, in page order (so a
 * branching book is predictable). Null before the first section.
 */
export function musicSectionAt(
  project: Pick<Project, 'pages' | 'music'>,
  pageIndex: number,
): MusicSection | null {
  let best: MusicSection | null = null;
  for (const s of project.music.sections) {
    const fromIndex = project.pages.findIndex((p) => p.id === s.fromPageId);
    if (fromIndex < 0 || fromIndex > pageIndex) continue;
    if (!best || fromIndex >= best.fromIndex)
      best = { trackId: s.trackId, volume: s.volume, fromIndex };
  }
  return best;
}

export const bookHasMusic = (project: Pick<Project, 'music'>) =>
  project.music.sections.some((s) => s.trackId && project.music.tracks[s.trackId]);
