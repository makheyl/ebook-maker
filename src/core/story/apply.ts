import type { Draft } from 'immer';
import { createAnimationStep } from '../animation/factory';
import { placeCharacter } from '../character/placement';
import type { Rect } from '../geometry';
import { createImageElement } from '../schema/factories';
import type { AnimationStep, ImageElement, Project } from '../schema/types';
import type { MotionChoice, PageSuggestion } from './suggest-motions';

export type StoryPlanRow = PageSuggestion & { pageId: string; include: boolean };

function step(
  elementId: string,
  choice: MotionChoice,
  trigger: AnimationStep['trigger'],
  delay = 0,
): AnimationStep {
  const s = createAnimationStep(elementId, choice.motion, trigger);
  return { ...s, delay, params: { ...s.params, ...choice.params } };
}

/**
 * Applies a reviewed story plan (an Immer recipe → one undo step): places the character on
 * pages that don't have it (same spot as the previous page), replaces its story animations
 * with the planned entrance / action / exit, and sets per-page idles.
 */
export function applyStoryPlan(
  draft: Draft<Project>,
  characterId: string,
  rows: readonly StoryPlanRow[],
): void {
  const character = draft.characters[characterId];
  const asset = character ? draft.assets[character.assetId] : undefined;
  if (!character || !asset) return;
  let slot: Rect | undefined;

  for (const row of rows) {
    const page = draft.pages.find((p) => p.id === row.pageId);
    if (!page) continue;
    let instance = page.elements.find(
      (e): e is Draft<ImageElement> => e.type === 'image' && e.characterId === characterId,
    );
    if (!row.include) {
      if (instance)
        slot = { x: instance.x, y: instance.y, width: instance.width, height: instance.height };
      continue;
    }
    if (!instance) {
      const box = placeCharacter(page, draft.pageSize, asset, slot);
      const created = createImageElement(
        asset,
        box,
        { characterId, name: character.name },
        'exact',
      );
      page.elements.push(created);
      instance = page.elements[page.elements.length - 1] as Draft<ImageElement>;
    }
    slot = { x: instance.x, y: instance.y, width: instance.width, height: instance.height };

    // Story animations are replaced; tap reactions (interaction steps) are kept.
    const id = instance.id;
    page.animations = page.animations.filter(
      (a) => a.elementId !== id || a.trigger === 'onInteraction',
    );
    if (row.entrance) page.animations.push(step(id, row.entrance, 'onPageEnter'));
    if (row.action) {
      page.animations.push(
        row.entrance
          ? step(id, row.action, 'afterPrevious', 150)
          : step(id, row.action, 'onPageEnter', 500),
      );
    }
    if (row.exit) page.animations.push(step(id, row.exit, 'afterPrevious', 300));
    if (row.idle && row.idle !== character.idle?.preset) instance.idleOverride = row.idle;
    else delete instance.idleOverride;
  }
}
