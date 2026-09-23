import { describe, expect, it } from 'vitest';
import { createAnimationStep } from '../animation/factory';
import { PatchHistory } from '../history/patch-history';
import { repairProject } from '../migrations';
import {
  createButtonElement,
  createImageElement,
  createPage,
  createProject,
  createShapeElement,
  type Interaction,
  type Project,
} from '../schema';
import { deletePages, duplicatePage } from './pages';
import { deleteElements, duplicateElements } from './elements';
import { removeAnimations } from './animations';

const tap = (actions: Interaction['actions'], id = 'ia1'): Interaction => ({
  id,
  trigger: 'tap',
  actions,
  once: false,
});

/** Two pages; page 1 has a choice button that jumps to page 2 and plays a reaction step. */
function book() {
  const p1 = createPage();
  const p2 = createPage();
  const mascot = createShapeElement('ellipse', { x: 0, y: 0, width: 100, height: 100 });
  const reaction = {
    ...createAnimationStep(mascot.id, 'pulse'),
    trigger: 'onInteraction' as const,
  };
  const button = createButtonElement(
    'Go!',
    { x: 0, y: 0, width: 200, height: 80 },
    {
      interactions: [
        tap([
          { type: 'playStep', stepId: reaction.id },
          { type: 'goToPage', pageId: p2.id },
        ]),
      ],
    },
  );
  mascot.interactions = [tap([{ type: 'playStep', stepId: reaction.id }], 'ia2')];
  p1.elements.push(mascot, button);
  p1.animations.push(reaction);
  p1.flow = { next: p2.id, lockNext: false };
  const project = createProject({ pages: [p1, p2] });
  return { project, p1, p2, mascot, button, reaction };
}

const actionsOf = (project: Project, pageIndex: number, elementIndex: number) =>
  project.pages[pageIndex]!.elements[elementIndex]!.interactions?.flatMap((i) => i.actions) ?? [];

describe('reference hygiene', () => {
  it('deleting a page removes jumps to it and its next-page override; undo restores them', () => {
    const { project, p2 } = book();
    const history = new PatchHistory<Project>();
    const after = history.apply(project, (d) => deletePages(d, [p2.id]));
    expect(actionsOf(after, 0, 1).map((a) => a.type)).toEqual(['playStep']);
    expect(after.pages[0]!.flow?.next).toBeUndefined();
    const undone = history.undo(after)!;
    expect(undone).toEqual(project);
  });

  it('deleting a step (or its element) removes actions that play it', () => {
    const { project, p1, reaction, mascot } = book();
    const history = new PatchHistory<Project>();
    const noStep = history.apply(project, (d) => removeAnimations(d, p1.id, [reaction.id]));
    expect(actionsOf(noStep, 0, 1).map((a) => a.type)).toEqual(['goToPage']);
    // The mascot's only action pointed at the step, so the whole interaction goes.
    expect(noStep.pages[0]!.elements[0]!.interactions).toEqual([]);

    const noMascot = history.apply(project, (d) => deleteElements(d, p1.id, [mascot.id]));
    expect(noMascot.pages[0]!.animations).toEqual([]);
    expect(actionsOf(noMascot, 0, 0).map((a) => a.type)).toEqual(['goToPage']);
  });

  it('duplicating an element re-points its "play my reaction" at the copied step', () => {
    const { project, p1, mascot } = book();
    const history = new PatchHistory<Project>();
    let newIds: string[] = [];
    const after = history.apply(project, (d) => {
      newIds = duplicateElements(d, p1.id, [mascot.id]);
    });
    const page = after.pages[0]!;
    const copy = page.elements.find((e) => e.id === newIds[0])!;
    const copyStep = page.animations.find((a) => a.elementId === copy.id)!;
    const action = copy.interactions![0]!.actions[0]!;
    expect(action).toEqual({ type: 'playStep', stepId: copyStep.id });
    expect(copy.interactions![0]!.id).not.toBe(mascot.interactions![0]!.id);
  });

  it('duplicating a page re-points playStep actions and keeps jumps to other pages', () => {
    const { project, p1, p2 } = book();
    const history = new PatchHistory<Project>();
    const after = history.apply(project, (d) => void duplicatePage(d, p1.id));
    const copy = after.pages[1]!;
    const stepIds = new Set(copy.animations.map((a) => a.id));
    const buttonActions = copy.elements[1]!.interactions![0]!.actions;
    expect(buttonActions[0]!.type === 'playStep' && stepIds.has(buttonActions[0]!.stepId)).toBe(
      true,
    );
    expect(buttonActions[1]).toEqual({ type: 'goToPage', pageId: p2.id });
  });

  it('repair on load drops dangling targets and links to missing characters', () => {
    const { project, p2 } = book();
    const asset = {
      id: 'a',
      kind: 'image' as const,
      mime: 'image/png',
      width: 10,
      height: 10,
      bytes: 1,
    };
    const img = createImageElement(
      asset,
      { x: 0, y: 0, width: 10, height: 10 },
      { characterId: 'gone' },
    );
    const broken: Project = {
      ...project,
      pages: [
        { ...project.pages[0]!, elements: [...project.pages[0]!.elements, img] },
        ...project.pages.slice(1).filter((p) => p.id !== p2.id),
      ],
    };
    const repaired = repairProject(broken);
    expect(actionsOf(repaired, 0, 1).map((a) => a.type)).toEqual(['playStep']);
    expect(repaired.pages[0]!.flow?.next).toBeUndefined();
    const repairedImg = repaired.pages[0]!.elements[2]!;
    expect(repairedImg.type === 'image' && repairedImg.characterId).toBeFalsy();
  });

  it('repair returns the same object when nothing is wrong', () => {
    const { project } = book();
    expect(repairProject(project)).toBe(project);
  });
});
