import {
  audioSchedule,
  clampMix,
  DEFAULT_MIX,
  musicSectionAt,
  playLength,
  type StepStart,
} from '@/core/audio';
import { isInteractionStep, scheduleSteps } from '@/core/animation';
import type { AudioClip, AudioMix, Page, Project } from '@/core/schema';
import { findElement } from '@/core/schema/tree';
import { bubbleVoiceCues, defaultLanguageOf, resolveClip } from '@/core/voice';

/** What a bar on an audio lane is, and what can be done to it. */
export type AudioBarKind =
  | 'sound' // a timed sound clip: move, trim, fades, volume
  | 'voice' // a timed voice clip: move, fades, volume (no trim: each language is its own file)
  | 'pageVoice' // the page's voiceover: move
  | 'bubble' // a bubble's line: pinned to its entrance
  | 'music'; // the page's music, for context

export type AudioBar = {
  key: string;
  kind: AudioBarKind;
  label: string;
  group: number;
  /** ms into the group. */
  start: number;
  /** How long it plays (ms); a guess of 1 s when the file's length isn't known. */
  length: number;
  mix: AudioMix;
  clip?: AudioClip;
  /** The stored asset to draw a waveform from. */
  assetId?: string;
  /** The file's length (ms), for trimming. */
  fileMs?: number;
  /** When it's attached to a step: that step's start (ms into the group). */
  stepStart?: number;
  loop?: boolean;
};

export type AudioLane = { key: string; label: string; elementId?: string; bars: AudioBar[] };

const UNKNOWN_MS = 1000;

/** When each (non-tap) step starts, like the reader's timeline builds them. */
export function editorStepStarts(page: Page): StepStart[] {
  const starts: StepStart[] = [];
  scheduleSteps(page.animations).groups.forEach((group, gi) => {
    for (const s of group.steps) starts.push({ stepId: s.step.id, group: gi, at: s.start });
  });
  for (const step of page.animations) {
    if (isInteractionStep(step)) starts.push({ stepId: step.id, group: null, at: 0 });
  }
  return starts;
}

/**
 * The page's audio as timeline lanes: Voiceover (the page's voice, timed voice lines and
 * bubble lines), one lane per element with sounds, the page's own sounds, and the music (for
 * context). Voice bars show the recording in `lang` (falling back like the reader).
 */
export function buildAudioLanes(page: Page, project: Project, lang: string): AudioLane[] {
  const starts = editorStepStarts(page);
  const fallback = defaultLanguageOf(project);
  const voiceMs = (line: AudioClip['source'] | undefined) => {
    if (line?.kind !== 'voice') return undefined;
    const clip = resolveClip(line.line, lang, fallback);
    return clip ? { id: clip.id, ms: (clip.duration ?? 1.5) * 1000 } : undefined;
  };
  const voiceLane: AudioLane = { key: 'voice', label: 'Voiceover', bars: [] };
  const pageLane: AudioLane = { key: 'page', label: 'Page sounds', bars: [] };
  const elementLanes = new Map<string, AudioLane>();

  if (page.voiceover) {
    const clip = resolveClip(page.voiceover, lang, fallback);
    voiceLane.bars.push({
      key: 'page-voice',
      kind: 'pageVoice',
      label: 'Page voiceover',
      group: 0,
      start: page.voiceoverAt ?? 0,
      length: (clip?.duration ?? 1.5) * 1000,
      mix: DEFAULT_MIX,
      ...(clip ? { assetId: clip.id } : {}),
    });
  }

  for (const s of audioSchedule(page, starts)) {
    if (s.group === null) continue; // played by a tap: not on the ruler
    const { clip } = s;
    const stepStart =
      clip.start.kind === 'withStep'
        ? starts.find((x) => x.stepId === (clip.start as { stepId: string }).stepId)?.at
        : undefined;
    let bar: AudioBar;
    if (clip.source.kind === 'sound') {
      const sound = project.sounds[clip.source.soundId];
      const fileMs = sound?.duration !== undefined ? sound.duration * 1000 : undefined;
      bar = {
        key: clip.id,
        kind: 'sound',
        label: sound?.name ?? 'Sound',
        group: s.group,
        start: s.at,
        length: playLength(clip.mix, fileMs) ?? UNKNOWN_MS,
        mix: clip.mix,
        clip,
        ...(sound ? { assetId: sound.id } : {}),
        ...(fileMs !== undefined ? { fileMs } : {}),
        ...(stepStart !== undefined ? { stepStart } : {}),
        loop: clip.loop,
      };
    } else {
      const v = voiceMs(clip.source);
      bar = {
        key: clip.id,
        kind: 'voice',
        label: 'Voice line',
        group: s.group,
        start: s.at,
        length: v?.ms ?? 1500,
        mix: clip.mix,
        clip,
        ...(v ? { assetId: v.id } : {}),
        ...(stepStart !== undefined ? { stepStart } : {}),
      };
    }
    if (clip.elementId) {
      const name = findElement(page.elements, clip.elementId)?.name ?? 'Item';
      const lane = elementLanes.get(clip.elementId) ?? {
        key: `el:${clip.elementId}`,
        label: name,
        elementId: clip.elementId,
        bars: [],
      };
      lane.bars.push(bar);
      elementLanes.set(clip.elementId, lane);
    } else if (bar.kind === 'voice') {
      voiceLane.bars.push(bar);
    } else {
      pageLane.bars.push(bar);
    }
  }

  // Bubble lines, pinned where their bubble appears.
  const entrances = starts.flatMap((st) => {
    const step = page.animations.find((a) => a.id === st.stepId);
    return step?.kind === 'entrance' ? [{ ...st, elementId: step.elementId }] : [];
  });
  for (const cue of bubbleVoiceCues(page, entrances)) {
    if (cue.group === null) continue;
    const clip = resolveClip(cue.line, lang, fallback);
    voiceLane.bars.push({
      key: `bubble:${cue.elementId}`,
      kind: 'bubble',
      label: `${findElement(page.elements, cue.elementId)?.name ?? 'Bubble'} (bubble)`,
      group: cue.group,
      start: cue.at,
      length: (clip?.duration ?? 1.5) * 1000,
      mix: DEFAULT_MIX,
      ...(clip ? { assetId: clip.id } : {}),
    });
  }

  const lanes = [
    ...(voiceLane.bars.length ? [voiceLane] : []),
    ...elementLanes.values(),
    ...(pageLane.bars.length ? [pageLane] : []),
  ];
  const index = project.pages.findIndex((p) => p.id === page.id);
  const section = index >= 0 ? musicSectionAt(project, index) : null;
  const track = section?.trackId ? project.music.tracks[section.trackId] : undefined;
  if (track) {
    lanes.push({
      key: 'music',
      label: 'Music',
      bars: [
        {
          key: 'music',
          kind: 'music',
          label: track.name ?? 'Music',
          group: 0,
          start: 0,
          length: 0, // drawn across every group
          mix: { ...DEFAULT_MIX, volume: section!.volume },
          assetId: track.id,
        },
      ],
    });
  }
  return lanes;
}

/** How far each group's audio reaches (ms), so groups on the ruler make room for it. */
export function audioGroupEnds(lanes: readonly AudioLane[]): Map<number, number> {
  const ends = new Map<number, number>();
  for (const lane of lanes) {
    for (const bar of lane.bars) {
      if (bar.kind === 'music' || bar.loop) continue;
      ends.set(bar.group, Math.max(ends.get(bar.group) ?? 0, bar.start + bar.length));
    }
  }
  return ends;
}

export type AudioDragMode = 'move' | 'trimStart' | 'trimEnd' | 'fadeIn' | 'fadeOut' | 'volume';

/** The change a drag makes: a new start (clip or page voice) and/or mix settings. */
export type AudioDragResult = {
  start?: AudioClip['start'];
  voiceoverAt?: number;
  mix?: Partial<AudioMix>;
};

/**
 * What dragging a bar by `deltaMs` (or, for volume, `deltaVolume`) does (pure). The left trim
 * handle moves the in-point and the start together, so the audio stays where it was.
 */
export function audioDragResult(
  bar: AudioBar,
  mode: AudioDragMode,
  deltaMs: number,
  snap: (ms: number) => number = (ms) => ms,
  deltaVolume = 0,
): AudioDragResult {
  const startAt = (ms: number): AudioDragResult => {
    const at = Math.max(0, Math.round(ms));
    if (bar.kind === 'pageVoice') return { voiceoverAt: at };
    const clip = bar.clip!;
    if (clip.start.kind === 'withStep' && bar.stepStart !== undefined) {
      return { start: { ...clip.start, offset: Math.round(at - bar.stepStart) } };
    }
    return { start: { kind: 'time', group: bar.group, at } };
  };
  const m = bar.mix;
  switch (mode) {
    case 'move':
      return startAt(snap(bar.start + deltaMs));
    case 'trimStart': {
      const maxIn = (m.trimEndMs ?? bar.fileMs ?? m.trimStartMs + bar.length) - 50;
      const trimStartMs = Math.round(
        Math.min(maxIn, Math.max(0, m.trimStartMs + deltaMs, m.trimStartMs - bar.start)),
      );
      const moved = trimStartMs - m.trimStartMs;
      return { ...startAt(bar.start + moved), mix: { trimStartMs } };
    }
    case 'trimEnd': {
      const end = (m.trimEndMs ?? bar.fileMs ?? m.trimStartMs + bar.length) + deltaMs;
      const max = bar.fileMs ?? Infinity;
      return {
        mix: { trimEndMs: Math.round(Math.min(max, Math.max(m.trimStartMs + 50, end))) },
      };
    }
    case 'fadeIn':
    case 'fadeOut': {
      const key = mode === 'fadeIn' ? 'fadeInMs' : 'fadeOutMs';
      const sign = mode === 'fadeIn' ? 1 : -1;
      const next = clampMix({ ...m, [key]: Math.max(0, m[key] + sign * deltaMs) }, bar.length);
      return { mix: { [key]: next[key] } };
    }
    case 'volume':
      return {
        mix: { volume: Math.round(Math.min(1, Math.max(0, m.volume + deltaVolume)) * 100) / 100 },
      };
  }
}
