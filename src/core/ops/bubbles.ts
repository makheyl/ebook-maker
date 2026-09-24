import type { Draft } from 'immer';
import { createAnimationStep } from '../animation/factory';
import { pivotToLocal } from '../character/pivot';
import { tailTip } from '../render/bubble-geometry';
import { findElement, flattenElements } from '../schema/tree';
import type { AssetRef, BubbleElement, Page, PageElement, Project } from '../schema/types';
import { getPage } from './pages';
import { cleanReferences } from './references';

type Point = { x: number; y: number };
type DraftPage = Draft<Project>['pages'][number];

/**
 * Where a tail attaches on an element, in its box's 0–1 units: just above the top-centre of a
 * picture's visible pixels (a character's head), or the top-centre of anything else.
 */
export function defaultTailAnchor(
  target: PageElement,
  asset: Pick<AssetRef, 'width' | 'height' | 'opaqueBounds'> | undefined,
): Point {
  if (target.type !== 'image' || !asset) return { x: 0.5, y: 0 };
  const b = asset.opaqueBounds ?? { x: 0, y: 0, width: 1, height: 1 };
  const local = pivotToLocal(asset, target, { x: b.x + b.width / 2, y: b.y });
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  // A little above the head, so the tail doesn't touch the artwork.
  return { x: clamp(local.x), y: clamp(local.y - 0.03) };
}

/**
 * Points a bubble's tail at an element. A character becomes the speaker too ("Pip says…"),
 * unless the bubble already has one.
 */
export function attachTail(
  draft: Draft<Project>,
  pageId: string,
  bubbleId: string,
  targetId: string,
  anchor?: Point,
): void {
  const page = getPage(draft, pageId);
  const bubble = findElement(page.elements, bubbleId);
  const target = findElement(page.elements, targetId);
  if (bubble?.type !== 'bubble' || !target || target.id === bubble.id) return;
  if (
    target.type === 'group' &&
    flattenElements([target as PageElement]).some((e) => e.id === bubbleId)
  )
    return;
  const asset = target.type === 'image' ? draft.assets[target.assetId] : undefined;
  bubble.tail.targetId = target.id;
  bubble.tail.anchor = anchor ?? defaultTailAnchor(target as PageElement, asset);
  if (target.type === 'image' && target.characterId) bubble.speakerId = target.characterId;
}

/** Frees a bubble's tail, leaving it pointing where it pointed (or at `tip`). */
export function detachTail(
  draft: Draft<Project>,
  pageId: string,
  bubbleId: string,
  tip?: Point,
): void {
  const page = getPage(draft, pageId);
  const bubble = findElement(page.elements, bubbleId);
  if (bubble?.type !== 'bubble') return;
  bubble.tail.tip = tip ?? tailTip(page.elements as PageElement[], bubble as BubbleElement);
  delete bubble.tail.targetId;
}

/** Tails pointing at elements about to be deleted keep pointing at the same spot. */
export function freeTailsPointingAt(page: DraftPage, ids: ReadonlySet<string>): void {
  const all = flattenElements(page.elements as PageElement[]);
  for (const el of all) {
    if (el.type !== 'bubble' || ids.has(el.id) || !el.tail.targetId) continue;
    if (!ids.has(el.tail.targetId)) continue;
    const draftBubble = findElement(page.elements, el.id) as Draft<BubbleElement>;
    draftBubble.tail.tip = tailTip(page.elements as PageElement[], el);
    delete draftBubble.tail.targetId;
  }
}

/** The step that pops the bubble in when its speaker is tapped, if there is one. */
export function bubbleTapStep(page: Page, bubbleId: string): string | undefined {
  const bubble = findElement(page.elements, bubbleId);
  if (bubble?.type !== 'bubble' || !bubble.tail.targetId) return undefined;
  const target = findElement(page.elements, bubble.tail.targetId);
  const played = new Set(
    (target?.interactions ?? []).flatMap((i) =>
      i.actions.flatMap((a) => (a.type === 'playStep' ? [a.stepId] : [])),
    ),
  );
  return page.animations.find(
    (s) => s.elementId === bubbleId && s.trigger === 'onInteraction' && played.has(s.id),
  )?.id;
}

/**
 * "Show when Pip is tapped": the bubble stays hidden until its speaker is tapped, then pops out
 * of its tail. The speaker's existing tap reaction (a wiggle…) keeps playing alongside.
 */
export function showBubbleOnTap(draft: Draft<Project>, pageId: string, bubbleId: string): void {
  const page = getPage(draft, pageId);
  if (bubbleTapStep(page as Page, bubbleId)) return;
  const bubble = findElement(page.elements, bubbleId);
  if (bubble?.type !== 'bubble' || !bubble.tail.targetId) return;
  const target = findElement(page.elements, bubble.tail.targetId);
  if (!target) return;
  // Joins the speaker's tap (up to 8 actions), or becomes a new one (up to 4 per element).
  const tap = target.interactions?.find((i) => i.trigger === 'tap' && i.actions.length < 8);
  if (!tap && (target.interactions?.length ?? 0) >= 4) return;
  const step = createAnimationStep(bubbleId, 'popFromTail', 'onInteraction');
  page.animations.push(step);
  if (tap) {
    tap.actions.push({ type: 'playStep', stepId: step.id });
  } else {
    target.interactions = [
      ...(target.interactions ?? []),
      {
        id: `ia_${step.id}`,
        trigger: 'tap',
        once: false,
        actions: [{ type: 'playStep', stepId: step.id }],
      },
    ];
  }
}

/** Undoes showBubbleOnTap: the bubble shows all the time again. */
export function alwaysShowBubble(draft: Draft<Project>, pageId: string, bubbleId: string): void {
  const page = getPage(draft, pageId);
  const stepId = bubbleTapStep(page as Page, bubbleId);
  if (!stepId) return;
  page.animations = page.animations.filter((s) => s.id !== stepId);
  cleanReferences(draft);
}
