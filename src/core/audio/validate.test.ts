import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createAnimationStep } from '../animation';
import { addClip, createClip } from '../ops/audio';
import { createPage, createProject, createShapeElement, type Project } from '../schema';
import { AUDIO_WARNING_BYTES, validateAudio } from './validate';

function book(at: number): Project {
  const shape = createShapeElement('rect', { x: 0, y: 0, width: 10, height: 10 });
  const fade = { ...createAnimationStep(shape.id, 'fadeIn', 'onPageEnter'), duration: 1000 };
  const page = { ...createPage(), elements: [shape], animations: [fade] };
  return produce(createProject({ pages: [page] }), (d) => {
    d.sounds.snd_a = { id: 'snd_a', kind: 'audio', mime: 'audio/wav', bytes: 1, duration: 0.5 };
    addClip(d, d.pages[0]!.id, {
      ...createClip({ kind: 'sound', soundId: 'snd_a' }, { kind: 'time', group: 0, at }),
      id: 'ac_1',
    });
  });
}

describe('audio checks', () => {
  it('a book with well-timed audio has no problems', () => {
    expect(validateAudio(book(500))).toEqual([]);
  });

  it('warns about a clip that starts after the page has finished', () => {
    expect(validateAudio(book(4000)).map((i) => i.id)).toEqual(['audio-late:ac_1']);
  });

  it('flags a removed sound and a music section without its track', () => {
    const project = produce(book(500), (d) => {
      delete d.sounds.snd_a;
      d.music.sections = [{ fromPageId: d.pages[0]!.id, trackId: 'mu_gone', volume: 1 }];
    });
    expect(validateAudio(project).map((i) => [i.id, i.severity])).toEqual([
      ['audio-gone:ac_1', 'error'],
      [`music-gone:${project.pages[0]!.id}`, 'error'],
    ]);
  });

  it('suggests ZIP when voiceover and music pass 80 MB', () => {
    const project = produce(book(500), (d) => {
      d.music.tracks.mu_big = {
        id: 'mu_big',
        kind: 'music',
        mime: 'audio/mpeg',
        bytes: AUDIO_WARNING_BYTES + 1,
        name: 'Big',
      };
    });
    expect(validateAudio(project).map((i) => i.id)).toEqual(['audio-size']);
  });
});
