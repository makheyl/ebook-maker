import type { Draft } from 'immer';
import { createAnimationStep } from '../animation/factory';
import type { Page } from '../schema/types';

/** Whether tapping the element already plays an animation. */
export function hasTapReaction(page: Page | Draft<Page>, elementId: string): boolean {
  const el = page.elements.find((e) => e.id === elementId);
  return !!el?.interactions?.some((i) => i.actions.some((a) => a.type === 'playStep'));
}

/**
 * Gives an element a tap reaction (an "on interaction" step plus the interaction that plays
 * it). No-op when it already has one. Mutates the (draft) page; returns the new step id.
 */
export function addTapReactionTo(
  page: Draft<Page>,
  elementId: string,
  presetId = 'wiggle',
): string | undefined {
  const el = page.elements.find((e) => e.id === elementId);
  if (!el || hasTapReaction(page, elementId) || (el.interactions?.length ?? 0) >= 4) return;
  const step = createAnimationStep(elementId, presetId, 'onInteraction');
  page.animations.push(step);
  el.interactions = [
    ...(el.interactions ?? []),
    {
      id: `ia_${step.id}`,
      trigger: 'tap',
      once: false,
      actions: [{ type: 'playStep', stepId: step.id }],
    },
  ];
  return step.id;
}
