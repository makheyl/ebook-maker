import type { Draft } from 'immer';
import { flattenElements, walkElements } from '../schema/tree';
import type { PageElement, Project, StoryAction } from '../schema/types';

/**
 * Removes references that no longer point anywhere: animation steps of deleted elements,
 * actions that jump to deleted pages or play deleted steps, page "next" overrides to deleted
 * pages, character links to deleted characters, bubble tails and speakers that are gone,
 * and sounds that were removed. Only writes when something changes, so
 * Immer keeps untouched pages structurally shared.
 */
export function cleanReferences(draft: Draft<Project>): void {
  const pageIds = new Set(draft.pages.map((p) => p.id));
  for (const page of draft.pages) {
    const all = flattenElements(page.elements as PageElement[]);
    const elementIds = new Set(all.map((e) => e.id));
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

    walkElements(page.elements as PageElement[], (el) => {
      if (el.interactions?.some((i) => i.actions.some((a) => !valid(a)))) {
        el.interactions = el.interactions
          .map((i) => ({ ...i, actions: i.actions.filter(valid) }))
          .filter((i) => i.actions.length > 0);
      }
      if (el.type === 'image' && el.characterId && !draft.characters[el.characterId]) {
        delete el.characterId;
      }
      if (el.type === 'bubble') {
        // A tail whose speaker is gone stays where it pointed last (set by the op that removed
        // it, when it knew); a speaker that no longer exists is forgotten.
        if (el.tail.targetId && !elementIds.has(el.tail.targetId)) delete el.tail.targetId;
        if (el.speakerId && !draft.characters[el.speakerId]) delete el.speakerId;
      }
    });
    const next = page.flow?.next;
    if (page.flow && next && next !== 'end' && !pageIds.has(next)) delete page.flow.next;
  }
  const turn = draft.reader.pageTurnSound;
  if (turn && !draft.sounds[turn]) delete draft.reader.pageTurnSound;
}
