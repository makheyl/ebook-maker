import { getIdleMotion, isInteractionStep, scheduleSteps, stepSpan } from '@/core/animation';
import type { AnimationStep, Page, PageElement, Project } from '@/core/schema';

/** A step placed on the timeline. `start`/`end` are ms from its group's start. */
export type TimelineBar = {
  step: AnimationStep;
  index: number;
  group: number;
  start: number;
  end: number;
  /** Where `delay` is measured from (start = anchor + delay). */
  anchor: number;
  loop: boolean;
};

export type TimelineLane = {
  element: PageElement;
  bars: TimelineBar[];
  /** Idle loop shown under a character's lane. */
  idle?: { id: string; label: string };
};

export type TimelineModel = {
  groups: { index: number; duration: number; label: string }[];
  lanes: TimelineLane[];
  /** Steps that only play when tapped (shown with their own local time). */
  interaction: TimelineBar[];
};

/** Minimum width of a click group on the ruler, so empty groups stay clickable. */
export const MIN_GROUP_MS = 1500;
/** Extra room after the last bar of a group. */
export const GROUP_TAIL_MS = 500;

export function buildTimelineModel(page: Page, project: Project): TimelineModel {
  const schedule = scheduleSteps(page.animations);
  const bars = new Map<string, TimelineBar[]>();
  schedule.groups.forEach((group, gi) => {
    for (const s of group.steps) {
      const bar: TimelineBar = {
        step: s.step,
        index: s.index,
        group: gi,
        start: s.start,
        end: s.end,
        anchor: s.start - s.step.delay,
        loop: !!s.step.loop,
      };
      bars.set(s.step.elementId, [...(bars.get(s.step.elementId) ?? []), bar]);
    }
  });

  const interaction: TimelineBar[] = page.animations.flatMap((step, index) =>
    isInteractionStep(step)
      ? [
          {
            step,
            index,
            group: -1,
            start: step.delay,
            end: step.delay + stepSpan(step),
            anchor: 0,
            loop: !!step.loop,
          },
        ]
      : [],
  );

  const lanes: TimelineLane[] = [];
  for (const element of [...page.elements].reverse()) {
    const character =
      element.type === 'image' && element.characterId
        ? project.characters[element.characterId]
        : undefined;
    const idleId =
      element.type === 'image' ? (element.idleOverride ?? character?.idle?.preset) : undefined;
    const idleMotion = character && idleId !== 'none' ? getIdleMotion(idleId) : undefined;
    const laneBars = bars.get(element.id) ?? [];
    if (!laneBars.length && !idleMotion) continue;
    lanes.push({
      element,
      bars: laneBars,
      ...(idleMotion ? { idle: { id: idleMotion.id, label: idleMotion.label } } : {}),
    });
  }

  return {
    groups: schedule.groups.map((g, i) => ({
      index: i,
      duration: g.duration,
      label: i === 0 ? 'Page opens' : `Click ${i}`,
    })),
    lanes,
    interaction,
  };
}

/** Width in ms each group takes on the ruler. */
export function groupSpan(duration: number): number {
  return Math.max(MIN_GROUP_MS, duration + GROUP_TAIL_MS);
}

/** Left edge (px) of every group, given a scale and a gap between groups. */
export function groupOffsets(durations: readonly number[], pxPerMs: number, gap: number): number[] {
  const out: number[] = [];
  let x = 0;
  for (const d of durations) {
    out.push(x);
    x += groupSpan(d) * pxPerMs + gap;
  }
  return out;
}

export type SnapOptions = { targets: readonly number[]; thresholdMs: number; grid?: number };

/** Snaps a time to the nearest target within the threshold, else to the grid (if any). */
export function snapTime(ms: number, { targets, thresholdMs, grid }: SnapOptions): number {
  let best = ms;
  let bestDist = thresholdMs;
  for (const t of targets) {
    const d = Math.abs(t - ms);
    if (d <= bestDist) {
      best = t;
      bestDist = d;
    }
  }
  if (best !== ms) return best;
  return grid ? Math.round(ms / grid) * grid : ms;
}

/** New delay/duration for a bar being moved or resized, clamped to valid values. */
export function dragResult(
  bar: TimelineBar,
  mode: 'move' | 'start' | 'end',
  deltaMs: number,
  snap: (ms: number) => number,
): { delay: number; duration: number } {
  const { step, anchor } = bar;
  if (mode === 'move') {
    const start = Math.max(anchor, snap(bar.start + deltaMs));
    return { delay: Math.min(60000, Math.round(start - anchor)), duration: step.duration };
  }
  if (mode === 'end') {
    const end = snap(bar.start + step.duration + deltaMs);
    return {
      delay: step.delay,
      duration: Math.min(60000, Math.max(50, Math.round(end - bar.start))),
    };
  }
  // Left edge: the end stays put.
  const end = bar.start + step.duration;
  const start = Math.min(end - 50, Math.max(anchor, snap(bar.start + deltaMs)));
  return { delay: Math.round(start - anchor), duration: Math.round(end - start) };
}

/** Snap targets for a group: other bars' edges, the group start and the playhead. */
export function snapTargets(
  model: TimelineModel,
  group: number,
  excludeStepId: string,
  playhead?: number,
) {
  const targets = [0];
  for (const lane of model.lanes) {
    for (const bar of lane.bars) {
      if (bar.group !== group || bar.step.id === excludeStepId) continue;
      targets.push(bar.start, bar.end);
    }
  }
  if (playhead !== undefined) targets.push(playhead);
  return targets;
}
