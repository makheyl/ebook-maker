import type { Draft } from 'immer';
import type { Project, StoryAction } from '../schema/types';

/**
 * Removes references that no longer point anywhere: animation steps of deleted elements,
 * actions that jump to deleted pages or play deleted steps, page "next" overrides to deleted
 * pages, character links to deleted characters, and sounds that were removed. Only writes when something changes, so
 * Immer keeps untouched pages structurally shared.
 */
export function cleanReferences(draft: Draft<Project>): void {
  const pageIds = new Set(draft.pages.map((p) => p.id));
  for (const page of draft.pages) {
    const elementIds = new Set(page.elements.map((e) => e.id));
    if (page.animations.some((a) => !elementIds.has(a.elementId))) {
      page.animations = page.animations.filter((a) => elementIds.has(a.elementId));
    }
    const stepIds = new Set(page.animations.map((a) => a.id));
    const valid = (a: StoryAction) =>
      a.type === 'goToPage'
        ? pageIds.has(a.pageId)
        : a.type === 'playStep'
          ? stepIds.has(a.stepId)
          : a.type === 'playSound'
            ? !!draft.sounds[a.soundId]
            : true;

    for (const el of page.elements) {
      if (el.interactions?.some((i) => i.actions.some((a) => !valid(a)))) {
        el.interactions = el.interactions
          .map((i) => ({ ...i, actions: i.actions.filter(valid) }))
          .filter((i) => i.actions.length > 0);
      }
      if (el.type === 'image' && el.characterId && !draft.characters[el.characterId]) {
        delete el.characterId;
      }
    }
    const next = page.flow?.next;
    if (page.flow && next && next !== 'end' && !pageIds.has(next)) delete page.flow.next;
  }
  const turn = draft.reader.pageTurnSound;
  if (turn && !draft.sounds[turn]) delete draft.reader.pageTurnSound;
}
