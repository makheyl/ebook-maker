import { isInteractionStep, scheduleSteps } from '../animation';
import type { CheckIssue } from '../interaction/validate';
import type { Project } from '../schema';
import { voiceClips } from '../voice/lines';
import { playLength } from './mix';
import { audioSchedule, type StepStart } from './schedule';

/** Above this, voiceover + music make single-file exports slow to open: suggest ZIP. */
export const AUDIO_WARNING_BYTES = 80 * 1024 * 1024;

/** Voiceover and music bytes together (what makes an audio-heavy export big). */
export function voiceAndMusicBytes(project: Project): number {
  const voice = voiceClips(project).reduce((sum, c) => sum + c.bytes, 0);
  const music = Object.values(project.music.tracks).reduce((sum, t) => sum + t.bytes, 0);
  return voice + music;
}

/**
 * Audio checks: clips whose sound is gone, clips that start after everything else on their
 * page has finished, music sections pointing at a removed track, and very large audio.
 */
export function validateAudio(project: Project): CheckIssue[] {
  const issues: CheckIssue[] = [];
  project.pages.forEach((page, i) => {
    const schedule = scheduleSteps(page.animations);
    const starts: StepStart[] = [];
    schedule.groups.forEach((g, gi) => {
      for (const s of g.steps) starts.push({ stepId: s.step.id, group: gi, at: s.start });
    });
    for (const step of page.animations) {
      if (isInteractionStep(step)) starts.push({ stepId: step.id, group: null, at: 0 });
    }
    const timed = audioSchedule(page, starts);
    const lengthOf = (clip: (typeof timed)[number]['clip']) => {
      if (clip.source.kind !== 'sound') return undefined;
      const sound = project.sounds[clip.source.soundId];
      return playLength(
        clip.mix,
        sound?.duration !== undefined ? sound.duration * 1000 : undefined,
      );
    };

    for (const { clip, group, at } of timed) {
      const elementId = clip.elementId ? { elementId: clip.elementId } : {};
      if (clip.source.kind === 'sound' && !project.sounds[clip.source.soundId]) {
        issues.push({
          id: `audio-gone:${clip.id}`,
          severity: 'error',
          pageId: page.id,
          ...elementId,
          message: `A sound on page ${i + 1} was removed from the book — it won't play.`,
        });
        continue;
      }
      if (group === null) continue;
      // Everything else in its group: the animations, and the other clips.
      let end = schedule.groups[group]?.steps.reduce((m, s) => Math.max(m, s.end), 0) ?? 0;
      for (const other of timed) {
        if (other.clip.id === clip.id || other.group !== group) continue;
        end = Math.max(end, other.at + (lengthOf(other.clip) ?? 0));
      }
      if (end > 0 && at > end + 1000) {
        issues.push({
          id: `audio-late:${clip.id}`,
          severity: 'warning',
          pageId: page.id,
          ...elementId,
          message: `A sound on page ${i + 1} starts at ${(at / 1000).toFixed(1)} s, after the page has finished — readers may have turned the page by then.`,
        });
      }
    }
  });

  for (const section of project.music.sections) {
    if (section.trackId && !project.music.tracks[section.trackId]) {
      const index = project.pages.findIndex((p) => p.id === section.fromPageId);
      issues.push({
        id: `music-gone:${section.fromPageId}`,
        severity: 'error',
        pageId: section.fromPageId,
        message: `The music from page ${index + 1} was removed — nothing plays there.`,
      });
    }
  }

  const bytes = voiceAndMusicBytes(project);
  if (bytes > AUDIO_WARNING_BYTES && project.pages[0]) {
    issues.push({
      id: 'audio-size',
      severity: 'warning',
      pageId: project.pages[0].id,
      message: `Voiceover and music add up to ${Math.round(bytes / 1024 / 1024)} MB. Export as ZIP so the book opens quickly.`,
    });
  }
  return issues;
}
