import type { Draft } from 'immer';
import type { AnimationStep, Project } from '../schema/types';
import { getPage } from './pages';
import { arrayMove } from './util';

type DraftStep = Draft<Project>['pages'][number]['animations'][number];

export function addAnimation(
  draft: Draft<Project>,
  pageId: string,
  step: AnimationStep,
  index?: number,
): void {
  const page = getPage(draft, pageId);
  page.animations.splice(index ?? page.animations.length, 0, step);
}

export function updateAnimation(
  draft: Draft<Project>,
  pageId: string,
  stepId: string,
  recipe: (step: DraftStep) => void,
): void {
  const step = getPage(draft, pageId).animations.find((a) => a.id === stepId);
  if (step) recipe(step);
}

export function removeAnimations(
  draft: Draft<Project>,
  pageId: string,
  ids: readonly string[],
): void {
  const doomed = new Set(ids);
  const page = getPage(draft, pageId);
  page.animations = page.animations.filter((a) => !doomed.has(a.id));
}

export function moveAnimation(
  draft: Draft<Project>,
  pageId: string,
  from: number,
  to: number,
): void {
  arrayMove(getPage(draft, pageId).animations, from, to);
}
