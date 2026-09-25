import { isGroup } from '../schema/tree';
import type { Page, PageElement, VoiceLine } from '../schema/types';

/** An entrance the timeline built (see PageTimeline.entrances). */
export type EntranceInfo = {
  elementId: string;
  stepId: string;
  group: number | null;
  at: number;
};

/**
 * When a voiced bubble is heard: `group` + `at` for timeline entrances (at is ms into the
 * group), `stepId` for entrances played by a tap (group null). A bubble without an entrance of
 * its own uses its nearest group's entrance; with none at all it's heard when the page opens
 * (group 0 at 0 ms). Hidden bubbles (or ones in hidden groups) are never heard.
 */
export type VoiceCue = {
  elementId: string;
  line: VoiceLine;
  group: number | null;
  at: number;
  stepId?: string;
};

export function bubbleVoiceCues(page: Page, entrances: readonly EntranceInfo[]): VoiceCue[] {
  const firstEntrance = (id: string) => entrances.find((e) => e.elementId === id);
  const cues: VoiceCue[] = [];
  const visit = (elements: readonly PageElement[], ancestors: string[]) => {
    for (const el of elements) {
      if (el.hidden) continue;
      if (isGroup(el)) {
        visit(el.children, [el.id, ...ancestors]);
        continue;
      }
      if (el.type !== 'bubble' || !el.voice || !Object.keys(el.voice).length) continue;
      const entrance =
        firstEntrance(el.id) ?? ancestors.map(firstEntrance).find((e): e is EntranceInfo => !!e);
      cues.push(
        entrance
          ? {
              elementId: el.id,
              line: el.voice,
              group: entrance.group,
              at: entrance.at,
              ...(entrance.group === null ? { stepId: entrance.stepId } : {}),
            }
          : { elementId: el.id, line: el.voice, group: 0, at: 0 },
      );
    }
  };
  visit(page.elements, []);
  // Timeline order: by group, then start time (tap cues last; they play when tapped).
  return cues.sort((a, b) => (a.group ?? Infinity) - (b.group ?? Infinity) || a.at - b.at);
}
