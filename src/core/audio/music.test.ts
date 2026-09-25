import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { migrate } from '../migrations';
import { addMusicTracks, removeMusicTrack, setMusicSection } from '../ops/music';
import { deletePages } from '../ops/pages';
import { createPage, createProject, projectSchema, type MusicTrack, type Project } from '../schema';
import { bookHasMusic, musicSectionAt } from './music';

const track = (id: string): MusicTrack => ({ id, kind: 'music', mime: 'audio/mpeg', bytes: 10 });

function book(): Project {
  const pages = Array.from({ length: 6 }, () => createPage());
  const project = createProject({ pages });
  return produce(project, (d) => {
    addMusicTracks(d, [track('mu_calm'), track('mu_fast')]);
    setMusicSection(d, pages[1]!.id, 'mu_calm');
    setMusicSection(d, pages[3]!.id, 'mu_fast', 0.8);
    setMusicSection(d, pages[5]!.id, null);
  });
}

describe('background music sections', () => {
  it('each page plays the last section at or before it, in page order', () => {
    const p = book();
    expect(musicSectionAt(p, 0)).toBeNull();
    expect(musicSectionAt(p, 1)).toMatchObject({ trackId: 'mu_calm', volume: 0.6 });
    expect(musicSectionAt(p, 2)).toMatchObject({ trackId: 'mu_calm' });
    expect(musicSectionAt(p, 4)).toMatchObject({ trackId: 'mu_fast', volume: 0.8 });
    expect(musicSectionAt(p, 5)).toMatchObject({ trackId: null });
    expect(bookHasMusic(p)).toBe(true);
    expect(projectSchema.safeParse(p).success).toBe(true);
  });

  it('"carry on" removes a section; one section per page', () => {
    const p = book();
    const next = produce(p, (d) => {
      setMusicSection(d, p.pages[3]!.id, undefined);
      setMusicSection(d, p.pages[1]!.id, 'mu_fast');
    });
    expect(next.music.sections).toHaveLength(2);
    expect(musicSectionAt(next, 4)).toMatchObject({ trackId: 'mu_fast' });
  });

  it('sections of removed tracks and pages go too', () => {
    const p = book();
    const noFast = produce(p, (d) => removeMusicTrack(d, 'mu_fast'));
    expect(noFast.music.sections.map((s) => s.trackId)).toEqual(['mu_calm', null]);
    const noPage = produce(p, (d) => deletePages(d, [p.pages[1]!.id]));
    expect(noPage.music.sections.map((s) => s.trackId)).toEqual(['mu_fast', null]);
  });

  it('a v7 book gets an empty music list', () => {
    const v7 = { ...createProject(), schemaVersion: 7 } as Record<string, unknown>;
    delete v7.music;
    const migrated = migrate(v7) as Project;
    expect(migrated.music).toEqual({ tracks: {}, sections: [], ducking: true, crossfadeMs: 1500 });
    expect(bookHasMusic(migrated)).toBe(false);
  });
});
