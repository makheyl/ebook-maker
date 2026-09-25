import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createAnimationStep } from '@/core/animation';
import { DEFAULT_MIX } from '@/core/audio';
import { addClip, createClip } from '@/core/ops/audio';
import { createPage, createProject, createShapeElement, type Project } from '@/core/schema';
import { waveformPath } from '../audio/waveform';
import { audioDragResult, audioGroupEnds, buildAudioLanes, type AudioBar } from './audio-model';

function book(): Project {
  const shape = createShapeElement('rect', { x: 0, y: 0, width: 10, height: 10 });
  const pop = { ...createAnimationStep(shape.id, 'fadeIn', 'onPageEnter'), delay: 800 };
  const page = { ...createPage(), elements: [shape], animations: [pop] };
  return produce(createProject({ pages: [page] }), (d) => {
    d.sounds.snd_a = {
      id: 'snd_a',
      kind: 'audio',
      mime: 'audio/wav',
      bytes: 10,
      name: 'Ding',
      duration: 2,
    };
    const pageId = d.pages[0]!.id;
    addClip(d, pageId, {
      ...createClip(
        { kind: 'sound', soundId: 'snd_a' },
        { kind: 'withStep', stepId: pop.id, offset: 0 },
        shape.id,
      ),
      id: 'ac_with',
    });
    addClip(d, pageId, {
      ...createClip({ kind: 'sound', soundId: 'snd_a' }, { kind: 'time', group: 0, at: 3000 }),
      id: 'ac_time',
    });
  });
}

const sound = (over: Partial<AudioBar> = {}): AudioBar => ({
  key: 'ac_1',
  kind: 'sound',
  label: 'Ding',
  group: 0,
  start: 1000,
  length: 2000,
  fileMs: 2000,
  mix: { ...DEFAULT_MIX },
  clip: createClip({ kind: 'sound', soundId: 's' }, { kind: 'time', group: 0, at: 1000 }),
  ...over,
});

describe('timeline audio lanes', () => {
  it('puts element sounds on the element’s lane at its entrance, page sounds on their own', () => {
    const project = book();
    const lanes = buildAudioLanes(project.pages[0]!, project, 'en');
    expect(lanes.map((l) => l.label)).toEqual(['Rectangle', 'Page sounds']);
    expect(lanes[0]!.bars[0]).toMatchObject({ start: 800, length: 2000, stepStart: 800 });
    expect(lanes[1]!.bars[0]).toMatchObject({ start: 3000, length: 2000 });
    // The group makes room for the sound that ends at 5 s.
    expect(audioGroupEnds(lanes).get(0)).toBe(5000);
  });
});

describe('dragging audio bars', () => {
  it('moves a timed clip, and a clip tied to a step by its offset', () => {
    expect(audioDragResult(sound(), 'move', 250).start).toEqual({
      kind: 'time',
      group: 0,
      at: 1250,
    });
    expect(audioDragResult(sound(), 'move', -5000).start).toMatchObject({ at: 0 });
    const tied = sound({
      stepStart: 800,
      clip: createClip(
        { kind: 'sound', soundId: 's' },
        { kind: 'withStep', stepId: 'st', offset: 200 },
      ),
    });
    expect(audioDragResult(tied, 'move', 300).start).toEqual({
      kind: 'withStep',
      stepId: 'st',
      offset: 500,
    });
    expect(audioDragResult(sound({ kind: 'pageVoice', clip: undefined }), 'move', 400)).toEqual({
      voiceoverAt: 1400,
    });
  });

  it('snaps the start', () => {
    const r = audioDragResult(sound(), 'move', 480, (ms) => Math.round(ms / 500) * 500);
    expect(r.start).toMatchObject({ at: 1500 });
  });

  it('trimming the left edge keeps the audio where it was', () => {
    const r = audioDragResult(sound(), 'trimStart', 300);
    expect(r.mix).toEqual({ trimStartMs: 300 });
    expect(r.start).toMatchObject({ at: 1300 });
    // Can't trim past the start of the page or the file's end.
    expect(audioDragResult(sound(), 'trimStart', -500).mix).toEqual({ trimStartMs: 0 });
    expect(audioDragResult(sound(), 'trimStart', 9000).mix).toEqual({ trimStartMs: 1950 });
  });

  it('trims the right edge within the file', () => {
    expect(audioDragResult(sound(), 'trimEnd', -500).mix).toEqual({ trimEndMs: 1500 });
    expect(audioDragResult(sound(), 'trimEnd', 5000).mix).toEqual({ trimEndMs: 2000 });
  });

  it('clamps fades to the clip and the volume to 0–100 %', () => {
    expect(audioDragResult(sound(), 'fadeIn', 400).mix).toEqual({ fadeInMs: 400 });
    expect(audioDragResult(sound(), 'fadeOut', -600).mix).toEqual({ fadeOutMs: 600 });
    expect(audioDragResult(sound(), 'fadeIn', 99999).mix!.fadeInMs).toBeLessThanOrEqual(2000);
    expect(audioDragResult(sound(), 'fadeIn', -300).mix).toEqual({ fadeInMs: 0 });
    expect(audioDragResult(sound(), 'volume', 0, undefined, -0.25).mix).toEqual({ volume: 0.75 });
    expect(audioDragResult(sound(), 'volume', 0, undefined, 2).mix).toEqual({ volume: 1 });
    expect(audioDragResult(sound(), 'volume', 0, undefined, -2).mix).toEqual({ volume: 0 });
  });
});

describe('waveforms', () => {
  it('draws one line per peak in the trimmed part', () => {
    const peaks = new Float32Array([0, 0.5, 1, 0.5]);
    expect(waveformPath(peaks, 0, 1, 30, 20)).toBe(
      'M0.0,9.5V10.5M10.0,5.0V15.0M20.0,0.0V20.0M30.0,5.0V15.0',
    );
    expect(waveformPath(peaks, 0.5, 1, 10, 20)).toBe('M0.0,0.0V20.0M10.0,5.0V15.0');
  });
});
