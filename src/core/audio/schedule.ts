import type { AudioClip, Page } from '../schema/types';

/** When an animation step was built to start (see PageTimeline.starts). */
export type StepStart = { stepId: string; group: number | null; at: number };

/**
 * When a clip plays: `group` + `at` (ms into the click group), or — for a clip attached to a
 * step that only plays when tapped — `group: null` and that step's id.
 */
export type ScheduledClip = { clip: AudioClip; group: number | null; at: number; stepId?: string };

export const openSoundClipId = (pageId: string) => `open-${pageId}`.slice(0, 64);

/**
 * Every timed clip of a page and when it starts. Shared by the reader and the editor's
 * timeline, so both play audio at the same moments. A clip attached to a step that no longer
 * exists (or wasn't built, e.g. on a hidden element) starts when the page opens.
 */
export function audioSchedule(page: Page, starts: readonly StepStart[]): ScheduledClip[] {
  const byStep = new Map(starts.map((s) => [s.stepId, s]));
  const out: ScheduledClip[] = [];
  for (const clip of page.audio ?? []) {
    if (clip.start.kind === 'time') {
      out.push({ clip, group: clip.start.group, at: clip.start.at });
      continue;
    }
    const step = byStep.get(clip.start.stepId);
    if (!step) {
      out.push({ clip, group: 0, at: Math.max(0, clip.start.offset) });
    } else if (step.group === null) {
      out.push({ clip, group: null, at: Math.max(0, clip.start.offset), stepId: step.stepId });
    } else {
      out.push({ clip, group: step.group, at: Math.max(0, step.at + clip.start.offset) });
    }
  }
  return out.sort((a, b) => (a.group ?? Infinity) - (b.group ?? Infinity) || a.at - b.at);
}

/** The entrance step that shows an element (for "when it appears"), if any. */
export function entranceStepOf(page: Page, elementId: string): string | undefined {
  return page.animations.find((s) => s.elementId === elementId && s.kind === 'entrance')?.id;
}
