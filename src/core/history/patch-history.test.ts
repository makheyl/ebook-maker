import { describe, expect, it } from 'vitest';
import {
  addAnimation,
  addElements,
  addPage,
  deleteElements,
  deletePages,
  duplicateElements,
  duplicatePage,
  movePage,
  patchElements,
  reorderElements,
  updateElement,
} from '../ops';
import {
  createPage,
  createProject,
  createShapeElement,
  createTextElement,
} from '../schema/factories';
import type { Project } from '../schema/types';
import { PatchHistory } from './patch-history';

function setup() {
  const project = createProject({ title: 'History' });
  const pageId = project.pages[0]!.id;
  const a = createTextElement('A', { x: 0, y: 0, width: 100, height: 50 });
  const b = createShapeElement('rect', { x: 10, y: 10, width: 20, height: 20 });
  const c = createShapeElement('ellipse', { x: 30, y: 30, width: 20, height: 20 });
  project.pages[0]!.elements.push(a, b, c);
  let clock = 0;
  const history = new PatchHistory<Project>(300, 1000, () => clock);
  return { project, pageId, a, b, c, history, tick: (ms: number) => (clock += ms) };
}

/** Applies a change, then checks undo returns to the original and redo to the changed state. */
function expectUndoRedo(
  project: Project,
  history: PatchHistory<Project>,
  recipe: (d: Project) => void,
) {
  const changed = history.apply(project, recipe);
  expect(changed).not.toEqual(project);
  const undone = history.undo(changed)!;
  expect(undone).toEqual(project);
  const redone = history.redo(undone)!;
  expect(redone).toEqual(changed);
  return changed;
}

describe('patch history on core operations', () => {
  it('undoes and redoes page operations', () => {
    const { project, pageId, history } = setup();
    expectUndoRedo(project, history, (d) => addPage(d, createPage()));
    expectUndoRedo(project, history, (d) => void duplicatePage(d, pageId));
    const two = history.apply(project, (d) => addPage(d, createPage()));
    expectUndoRedo(two, history, (d) => movePage(d, 0, 1));
    expectUndoRedo(two, history, (d) => deletePages(d, [pageId]));
  });

  it('undoes and redoes element operations', () => {
    const { project, pageId, a, b, history } = setup();
    expectUndoRedo(project, history, (d) =>
      addElements(d, pageId, [createShapeElement('line', { x: 0, y: 0, width: 5, height: 5 })]),
    );
    expectUndoRedo(project, history, (d) =>
      updateElement(d, pageId, a.id, (el) => {
        if (el.type === 'text') el.style.fontSize = 99;
      }),
    );
    expectUndoRedo(project, history, (d) =>
      patchElements(d, pageId, [{ id: b.id, patch: { x: 500 } }]),
    );
    expectUndoRedo(project, history, (d) => deleteElements(d, pageId, [a.id, b.id]));
    expectUndoRedo(project, history, (d) => void duplicateElements(d, pageId, [a.id]));
    expectUndoRedo(project, history, (d) => reorderElements(d, pageId, [a.id], 'front'));
  });

  it('removes an element’s animations with it, and brings them back on undo', () => {
    const { project, pageId, a, history } = setup();
    const withAnim = history.apply(project, (d) =>
      addAnimation(d, pageId, {
        id: 'an1',
        elementId: a.id,
        kind: 'entrance',
        preset: 'fadeIn',
        trigger: 'onPageEnter',
        duration: 500,
        delay: 0,
        easing: 'easeOut',
      }),
    );
    const deleted = history.apply(withAnim, (d) => deleteElements(d, pageId, [a.id]));
    expect(deleted.pages[0]!.animations).toHaveLength(0);
    expect(history.undo(deleted)!.pages[0]!.animations).toHaveLength(1);
  });

  it('keeps structural sharing: untouched pages keep their identity', () => {
    const { project, history } = setup();
    const two = history.apply(project, (d) => addPage(d, createPage()));
    const edited = history.apply(two, (d) => {
      d.pages[1]!.notes = 'x';
    });
    expect(edited.pages[0]).toBe(two.pages[0]);
  });

  it('groups a whole gesture into one undo step via transactions', () => {
    const { project, pageId, b, history } = setup();
    let state = project;
    history.begin('Move');
    for (let x = 11; x <= 60; x++) {
      state = history.apply(state, (d) => patchElements(d, pageId, [{ id: b.id, patch: { x } }]));
    }
    history.commit();
    expect(state.pages[0]!.elements[1]!.x).toBe(60);
    const undone = history.undo(state)!;
    expect(undone).toEqual(project);
    expect(history.canUndo).toBe(false);
  });

  it('coalesces rapid changes with the same key, but not across the window', () => {
    const { project, pageId, a, history, tick } = setup();
    const setSize = (s: Project, size: number) =>
      history.apply(
        s,
        (d) =>
          updateElement(d, pageId, a.id, (el) => {
            if (el.type === 'text') el.style.fontSize = size;
          }),
        { coalesceKey: 'font-size' },
      );
    let state = setSize(project, 10);
    tick(100);
    state = setSize(state, 20);
    tick(100);
    state = setSize(state, 30);
    tick(5000);
    state = setSize(state, 40);
    const once = history.undo(state)!;
    expect((once.pages[0]!.elements[0] as { style: { fontSize: number } }).style.fontSize).toBe(30);
    const twice = history.undo(once)!;
    expect(twice).toEqual(project);
  });

  it('clears the redo stack when a new change is made', () => {
    const { project, pageId, b, history } = setup();
    const moved = history.apply(project, (d) =>
      patchElements(d, pageId, [{ id: b.id, patch: { x: 1 } }]),
    );
    const undone = history.undo(moved)!;
    expect(history.canRedo).toBe(true);
    history.apply(undone, (d) => patchElements(d, pageId, [{ id: b.id, patch: { y: 1 } }]));
    expect(history.canRedo).toBe(false);
  });

  it('ignores no-op changes', () => {
    const { project, history } = setup();
    const same = history.apply(project, () => {});
    expect(same).toBe(project);
    expect(history.canUndo).toBe(false);
  });
});
