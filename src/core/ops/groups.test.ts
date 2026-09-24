import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createAnimationStep } from '../animation/factory';
import { rotatedBounds } from '../geometry';
import { createPageTimeline, type AnimateFn } from '../animation/timeline';
import { PatchHistory } from '../history/patch-history';
import { createPageView } from '../render/page-view';
import {
  ancestorsOf,
  createPage,
  createProject,
  createShapeElement,
  createTextElement,
  findElement,
  flattenElements,
  toPageSpace,
  type GroupElement,
  type PageElement,
  type Project,
} from '../schema';
import { deleteElements, duplicateElements } from './elements';
import {
  canGroup,
  fitGroupToChildren,
  groupElements,
  moveToParent,
  scaleGroupChildren,
  ungroupElements,
} from './groups';
import { reorderElements } from './layers';

const shape = (x: number, y: number, rotation = 0) =>
  createShapeElement('rect', { x, y, width: 100, height: 50 }, { rotation });

/** Where an element's centre is on the page, and its total rotation. */
function onPage(project: Project, id: string) {
  const els = project.pages[0]!.elements;
  const el = findElement(els, id)!;
  const chain = ancestorsOf(els, id);
  const c = toPageSpace(chain, { x: el.x + el.width / 2, y: el.y + el.height / 2 });
  const rot = chain.reduce((s, g) => s + g.rotation, el.rotation);
  return {
    x: Math.round(c.x * 100) / 100,
    y: Math.round(c.y * 100) / 100,
    rot: ((rot % 360) + 360) % 360,
  };
}

function book(...els: PageElement[]) {
  const page = createPage();
  page.elements.push(...els);
  return createProject({ pages: [page] });
}

describe('groups', () => {
  it('group then ungroup keeps every element exactly where it was, even in a rotated group', () => {
    const a = shape(100, 100, 30);
    const b = shape(400, 250);
    const c = shape(900, 900);
    const project = book(a, b, c);
    const before = [a, b].map((e) => onPage(project, e.id));
    const history = new PatchHistory<Project>();
    let groupId = '';
    const grouped = history.apply(project, (d) => {
      groupId = groupElements(d, d.pages[0]!.id, [a.id, b.id])!;
    });
    const g = findElement(grouped.pages[0]!.elements, groupId) as GroupElement;
    expect(g.type).toBe('group');
    expect(grouped.pages[0]!.elements.map((e) => e.id)).toEqual([groupId, c.id]);
    expect([a, b].map((e) => onPage(grouped, e.id))).toEqual(before);
    // The group's box is exactly its children's bounds.
    const minX = Math.min(...g.children.map((ch) => rotatedBounds(ch).x));
    expect(Math.abs(minX)).toBeLessThan(0.01);

    // Rotate the group, then ungroup: children keep their (rotated) place on the page.
    const rotated = produce(grouped, (d) => {
      (findElement(d.pages[0]!.elements, groupId) as GroupElement).rotation = 45;
    });
    const spun = [a, b].map((e) => onPage(rotated, e.id));
    const flat = produce(rotated, (d) => void ungroupElements(d, d.pages[0]!.id, groupId));
    expect(flat.pages[0]!.elements.map((e) => e.id)).toEqual([a.id, b.id, c.id]);
    expect([a, b].map((e) => onPage(flat, e.id))).toEqual(spun);
    expect(history.undo(grouped)).toEqual(project);
  });

  it('keeps the group box fitted when a child moves, without moving anything on the page', () => {
    const a = shape(100, 100);
    const b = shape(300, 300);
    let project = book(a, b);
    let id = '';
    project = produce(project, (d) => {
      id = groupElements(d, d.pages[0]!.id, [a.id, b.id])!;
      (findElement(d.pages[0]!.elements, id) as GroupElement).rotation = 20;
    });
    const staying = onPage(project, b.id);
    project = produce(project, (d) => {
      const g = findElement(d.pages[0]!.elements, id) as GroupElement;
      const child = g.children.find((ch) => ch.id === a.id)!;
      child.x -= 80; // push a child outside the old box
      child.y -= 40;
      fitGroupToChildren(g);
    });
    const g = findElement(project.pages[0]!.elements, id) as GroupElement;
    expect(Math.min(...g.children.map((ch) => ch.x))).toBeCloseTo(0, 5);
    expect(Math.min(...g.children.map((ch) => ch.y))).toBeCloseTo(0, 5);
    expect(onPage(project, b.id)).toEqual(staying);
  });

  it('scales children when the group is resized (fonts stay)', () => {
    const t = createTextElement('Hi', { x: 0, y: 0, width: 200, height: 100 });
    const s = shape(200, 100);
    let project = book(t, s);
    let id = '';
    project = produce(project, (d) => {
      id = groupElements(d, d.pages[0]!.id, [t.id, s.id])!;
      scaleGroupChildren(findElement(d.pages[0]!.elements, id) as GroupElement, 600, 300);
    });
    const g = findElement(project.pages[0]!.elements, id) as GroupElement;
    expect([g.width, g.height]).toEqual([600, 300]);
    const text = g.children[0]!;
    expect([text.width, text.height]).toEqual([400, 200]);
    expect(text.type === 'text' && text.style.fontSize).toBe(t.style.fontSize);
  });

  it('moves an element into and out of a group without moving it on the page', () => {
    const a = shape(100, 100);
    const b = shape(300, 300);
    const c = shape(600, 150, 10);
    let project = book(a, b, c);
    let id = '';
    project = produce(project, (d) => {
      id = groupElements(d, d.pages[0]!.id, [a.id, b.id])!;
      (findElement(d.pages[0]!.elements, id) as GroupElement).rotation = -30;
    });
    const where = onPage(project, c.id);
    const inside = produce(project, (d) => moveToParent(d, d.pages[0]!.id, c.id, id, 0));
    expect(ancestorsOf(inside.pages[0]!.elements, c.id).map((g) => g.id)).toEqual([id]);
    expect(onPage(inside, c.id)).toEqual(where);
    const out = produce(inside, (d) => moveToParent(d, d.pages[0]!.id, c.id, null, 5));
    expect(ancestorsOf(out.pages[0]!.elements, c.id)).toEqual([]);
    expect(onPage(out, c.id)).toEqual(where);
  });

  it('duplicates a group with fresh ids all the way down, re-pointing tap reactions', () => {
    const a = shape(100, 100);
    const b = shape(300, 300);
    const reaction = createAnimationStep(b.id, 'pulse', 'onInteraction');
    b.interactions = [
      {
        id: 'ia',
        trigger: 'tap',
        once: false,
        actions: [{ type: 'playStep', stepId: reaction.id }],
      },
    ];
    let project = book(a, b);
    project.pages[0]!.animations.push(reaction);
    let id = '';
    project = produce(project, (d) => {
      id = groupElements(d, d.pages[0]!.id, [a.id, b.id])!;
    });
    const dup = produce(project, (d) => void duplicateElements(d, d.pages[0]!.id, [id]));
    const all = flattenElements(dup.pages[0]!.elements);
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
    expect(all).toHaveLength(6);
    const copyOfB = (dup.pages[0]!.elements[1] as GroupElement).children[1]!;
    const stepId = copyOfB.interactions![0]!.actions[0]!;
    const copiedStep = dup.pages[0]!.animations.find((s) => s.elementId === copyOfB.id)!;
    expect(stepId).toEqual({ type: 'playStep', stepId: copiedStep.id });
  });

  it('deleting the last child removes the empty group and its steps', () => {
    const a = shape(100, 100);
    const b = shape(300, 300);
    let project = book(a, b);
    let id = '';
    project = produce(project, (d) => {
      id = groupElements(d, d.pages[0]!.id, [a.id, b.id])!;
      d.pages[0]!.animations.push(createAnimationStep(id, 'fadeIn'));
    });
    const after = produce(project, (d) => deleteElements(d, d.pages[0]!.id, [a.id, b.id]));
    expect(after.pages[0]!.elements).toEqual([]);
    expect(after.pages[0]!.animations).toEqual([]);
  });

  it('restacks inside a group, and refuses groups nested deeper than 3', () => {
    const els = [shape(0, 0), shape(10, 10), shape(20, 20), shape(30, 30)];
    let project = book(...els);
    let g1 = '';
    project = produce(project, (d) => {
      g1 = groupElements(d, d.pages[0]!.id, [els[0]!.id, els[1]!.id, els[2]!.id])!;
      reorderElements(d, d.pages[0]!.id, [els[0]!.id], 'front');
    });
    const g = findElement(project.pages[0]!.elements, g1) as GroupElement;
    expect(g.children.map((c) => c.id)).toEqual([els[1]!.id, els[2]!.id, els[0]!.id]);
    expect(canGroup(project.pages[0]!, [els[1]!.id, els[3]!.id])).toBe(false); // not siblings
    let depth2 = '';
    let depth3 = '';
    project = produce(project, (d) => {
      depth2 = groupElements(d, d.pages[0]!.id, [g1, els[3]!.id])!;
    });
    project = produce(project, (d) => {
      d.pages[0]!.elements.push(shape(500, 500) as never);
    });
    const extra = project.pages[0]!.elements.at(-1)!.id;
    project = produce(project, (d) => {
      depth3 = groupElements(d, d.pages[0]!.id, [depth2, extra])!;
    });
    expect(depth3).toBeTruthy();
    const last = shape(900, 900);
    project = produce(project, (d) => void d.pages[0]!.elements.push(last as never));
    expect(canGroup(project.pages[0]!, [depth3, last.id])).toBe(false); // would be 4 deep
  });

  it('renders children inside the group and animates a group as one', () => {
    const a = shape(100, 100);
    const b = shape(300, 300);
    let project = book(a, b);
    let id = '';
    project = produce(project, (d) => {
      id = groupElements(d, d.pages[0]!.id, [a.id, b.id])!;
      d.pages[0]!.animations.push(
        createAnimationStep(id, 'fadeIn'),
        createAnimationStep(a.id, 'pulse'),
      );
    });
    const view = createPageView({
      pageSize: { width: 1600, height: 1200 },
      mode: 'player',
      resolveAsset: () => undefined,
    });
    view.update(project.pages[0]!, {});
    const groupNodes = view.getNodes(id)!;
    expect(view.getNodes(a.id)!.frame.parentElement).toBe(groupNodes.anim);
    expect(groupNodes.frame.parentElement).toBe(view.root);
    const targets: Element[] = [];
    const animate: AnimateFn = (target) => {
      targets.push(target);
      return {
        pause() {},
        play() {},
        finish() {},
        cancel() {},
        currentTime: 0,
        playState: 'paused',
        finished: Promise.resolve(),
      } as unknown as Animation;
    };
    createPageTimeline(project.pages[0]!, (eid) => view.getNodes(eid), {
      pageSize: { width: 1600, height: 1200 },
      animate,
    });
    expect(targets).toContain(groupNodes.anim);
    expect(targets).toContain(view.getNodes(a.id)!.anim);
    // Ungrouping moves the frames back to the page.
    const flat = produce(project, (d) => void ungroupElements(d, d.pages[0]!.id, id));
    view.update(flat.pages[0]!, {});
    expect(view.getNodes(a.id)!.frame.parentElement).toBe(view.root);
    expect(view.getNodes(id)).toBeUndefined();
  });
});
