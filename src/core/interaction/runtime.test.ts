import { describe, expect, it } from 'vitest';
import { createAnimationStep } from '../animation/factory';
import {
  createButtonElement,
  createHotspotElement,
  createPage,
  createProject,
  type Interaction,
  type Page,
  type Project,
} from '../schema';
import { initialReaderState, reduce, type ReaderEvent, type ReaderState } from './runtime';

const tap = (
  actions: Interaction['actions'],
  once = false,
  id = 'ia-' + Math.random(),
): Interaction => ({
  id,
  trigger: 'tap',
  actions,
  once,
});

/** Runs events in order, returning the final state and every effect type. */
function run(project: Project, events: ReaderEvent[], state = initialReaderState()) {
  const effects: string[] = [];
  for (const event of events) {
    const r = reduce(project, state, event);
    state = r.state;
    effects.push(...r.effects.map((e) => e.type));
  }
  return { state, effects };
}

/**
 * A choose-your-path book:
 *   0 intro → 1 choice (buttons to 2 or 3) ; 2 "forest" → end ; 3 "sea" → end
 */
function branching() {
  const pages: Page[] = [createPage(), createPage(), createPage(), createPage()];
  const [, choice, forest, sea] = pages as [Page, Page, Page, Page];
  choice.elements.push(
    createButtonElement(
      'Forest',
      { x: 0, y: 0, width: 200, height: 80 },
      {
        id: 'b-forest',
        interactions: [tap([{ type: 'goToPage', pageId: forest.id }])],
      },
    ),
    createButtonElement(
      'Sea',
      { x: 300, y: 0, width: 200, height: 80 },
      {
        id: 'b-sea',
        interactions: [tap([{ type: 'goToPage', pageId: sea.id }])],
      },
    ),
  );
  choice.flow = { lockNext: true };
  forest.flow = { next: 'end', lockNext: false };
  return createProject({ pages });
}

describe('reader runtime', () => {
  it('plays click groups before turning the page', () => {
    const p0 = createPage();
    const s1 = { ...createAnimationStep('x', 'fadeIn'), trigger: 'onClick' as const };
    p0.animations.push(createAnimationStep('x', 'fadeIn'), s1);
    const project = createProject({ pages: [p0, createPage()] });
    let r = reduce(project, initialReaderState(), { type: 'next' });
    expect(r.effects).toEqual([{ type: 'playGroup', group: 1 }]);
    r = reduce(project, r.state, { type: 'next', groupRunning: true });
    expect(r.effects).toEqual([{ type: 'finishGroup', group: 1 }]);
    r = reduce(project, r.state, { type: 'next' });
    expect(r.effects).toEqual([{ type: 'showPage', page: 1, direction: 1 }]);
  });

  it('ignores onInteraction steps when counting clicks', () => {
    const p0 = createPage();
    p0.animations.push({ ...createAnimationStep('x', 'pulse'), trigger: 'onInteraction' });
    const project = createProject({ pages: [p0, createPage()] });
    expect(run(project, [{ type: 'next' }]).state.page).toBe(1);
  });

  it('branches with goToPage and goes back through history', () => {
    const project = branching();
    const { state, effects } = run(project, [
      { type: 'next' },
      { type: 'tap', elementId: 'b-sea' },
    ]);
    expect(state.page).toBe(3);
    expect(state.history).toEqual([0, 1]);
    expect(effects).toEqual(['showPage', 'showPage']);
    // Back returns to the choice page, not page 2 (the forest).
    const back = run(project, [{ type: 'prev' }], state);
    expect(back.state.page).toBe(1);
    expect(back.state.history).toEqual([0]);
    expect(run(project, [{ type: 'prev' }], back.state).state.page).toBe(0);
  });

  it('reaches both endings', () => {
    const project = branching();
    const forest = run(project, [
      { type: 'next' },
      { type: 'tap', elementId: 'b-forest' },
      { type: 'next' },
    ]);
    expect(forest.state.page).toBe(2);
    expect(forest.state.ended).toBe(true);
    expect(forest.effects.at(-1)).toBe('showEnd');

    const sea = run(project, [
      { type: 'next' },
      { type: 'tap', elementId: 'b-sea' },
      { type: 'next' },
    ]);
    expect(sea.state.page).toBe(3);
    expect(sea.state.ended).toBe(true);
    // Next at the end does nothing; back closes The End.
    expect(run(project, [{ type: 'next' }], sea.state).effects).toEqual([]);
    const reopened = run(project, [{ type: 'prev' }], sea.state);
    expect(reopened.state.ended).toBe(false);
    expect(reopened.effects).toEqual(['hideEnd']);
  });

  it('restart clears history, unlocks and the end', () => {
    const project = branching();
    const ended = run(project, [
      { type: 'next' },
      { type: 'tap', elementId: 'b-sea' },
      { type: 'next' },
    ]);
    const r = run(project, [{ type: 'restart' }], ended.state);
    expect(r.state).toEqual(initialReaderState());
    expect(r.effects).toEqual(['hideEnd', 'showPage']);
  });

  it('a locked page hints instead of turning until it is unlocked', () => {
    const project = branching();
    const choice = project.pages[1]!;
    choice.elements.push(
      createHotspotElement(
        { x: 0, y: 400, width: 100, height: 100 },
        {
          id: 'unlock',
          interactions: [tap([{ type: 'unlockNext' }])],
        },
      ),
    );
    const locked = run(project, [{ type: 'next' }, { type: 'next' }, { type: 'next' }]);
    expect(locked.state.page).toBe(1);
    expect(locked.effects).toEqual(['showPage', 'hint', 'hint']);
    const open = run(
      project,
      [{ type: 'tap', elementId: 'unlock' }, { type: 'next' }],
      locked.state,
    );
    expect(open.effects).toEqual(['unlocked', 'showPage']);
    expect(open.state.page).toBe(2);
    // Coming back to it later, it stays unlocked.
    const again = run(project, [{ type: 'prev' }, { type: 'next' }], open.state);
    expect(again.state.page).toBe(2);
  });

  it('tap reactions play without turning the page, and "once" fires a single time', () => {
    const p0 = createPage();
    const reaction = { ...createAnimationStep('m', 'pulse'), trigger: 'onInteraction' as const };
    p0.animations.push(reaction);
    p0.elements.push(
      createHotspotElement(
        { x: 0, y: 0, width: 10, height: 10 },
        {
          id: 'm',
          interactions: [
            tap([{ type: 'playStep', stepId: reaction.id }]),
            tap([{ type: 'burst', effect: 'sparkles' }], true, 'first-time'),
          ],
        },
      ),
    );
    const project = createProject({ pages: [p0, createPage()] });
    const first = run(project, [{ type: 'tap', elementId: 'm' }]);
    expect(first.effects).toEqual(['playStep', 'burst']);
    expect(first.state.page).toBe(0);
    expect(first.state.consumed).toEqual(['first-time']);
    const second = run(project, [{ type: 'tap', elementId: 'm' }], first.state);
    expect(second.effects).toEqual(['playStep']);
  });

  it('play-a-sound actions become sound effects without turning the page', () => {
    const p0 = createPage();
    p0.elements.push(
      createHotspotElement(
        { x: 0, y: 0, width: 10, height: 10 },
        {
          id: 'bell',
          interactions: [
            tap([
              { type: 'playSound', soundId: 'snd_ding' },
              { type: 'burst', effect: 'sparkles' },
            ]),
          ],
        },
      ),
    );
    const project = createProject({ pages: [p0, createPage()] });
    const r = reduce(project, initialReaderState(), { type: 'tap', elementId: 'bell' });
    expect(r.effects[0]).toEqual({ type: 'playSound', soundId: 'snd_ding' });
    expect(r.state.page).toBe(0);
  });

  it('stops running actions once the reader has left the page', () => {
    const p0 = createPage();
    const p1 = createPage();
    p0.elements.push(
      createButtonElement(
        'Go',
        { x: 0, y: 0, width: 10, height: 10 },
        {
          id: 'go',
          interactions: [tap([{ type: 'next' }, { type: 'burst', effect: 'hearts' }])],
        },
      ),
    );
    const project = createProject({ pages: [p0, p1] });
    const r = run(project, [{ type: 'tap', elementId: 'go' }]);
    expect(r.effects).toEqual(['showPage']);
  });

  it('collecting items reaches the page goal and unlocks next', () => {
    const p0 = createPage();
    p0.flow = { lockNext: true };
    p0.goal = { count: 2, label: 'Find the stars' };
    for (const id of ['s1', 's2']) {
      p0.elements.push(
        createHotspotElement(
          { x: 0, y: 0, width: 10, height: 10 },
          {
            id,
            interactions: [tap([{ type: 'collect' }])],
          },
        ),
      );
    }
    const project = createProject({ pages: [p0, createPage()] });
    let state: ReaderState = initialReaderState();
    let r = reduce(project, state, { type: 'tap', elementId: 's1' });
    expect(r.effects).toEqual([{ type: 'collect', elementId: 's1', count: 1, goal: 2 }]);
    state = reduce(project, r.state, { type: 'tap', elementId: 's1' }).state; // no double count
    r = reduce(project, state, { type: 'tap', elementId: 's2' });
    expect(r.effects.map((e) => e.type)).toEqual(['collect', 'unlocked', 'burst']);
    expect(reduce(project, r.state, { type: 'next' }).state.page).toBe(1);
  });

  it('flow.next skips pages and goto keeps history', () => {
    const pages = [createPage(), createPage(), createPage()];
    pages[0]!.flow = { next: pages[2]!.id, lockNext: false };
    const project = createProject({ pages });
    const r = run(project, [{ type: 'next' }]);
    expect(r.state.page).toBe(2);
    expect(run(project, [{ type: 'prev' }], r.state).state.page).toBe(0);
    const g = run(project, [{ type: 'goto', page: 1 }]);
    expect(g.state).toMatchObject({ page: 1, history: [0] });
    expect(run(project, [{ type: 'goto', page: 9 }]).effects).toEqual([]);
  });

  it('taps on hidden elements or elements without interactions do nothing', () => {
    const p0 = createPage();
    p0.elements.push(
      createButtonElement(
        'Hidden',
        { x: 0, y: 0, width: 10, height: 10 },
        {
          id: 'h',
          hidden: true,
          interactions: [tap([{ type: 'next' }])],
        },
      ),
    );
    const project = createProject({ pages: [p0, createPage()] });
    expect(
      run(project, [
        { type: 'tap', elementId: 'h' },
        { type: 'tap', elementId: 'nope' },
      ]).effects,
    ).toEqual([]);
  });
});

describe('interactivity checks', () => {
  it('flags a dead-end locked page, unnamed controls and dangling targets', async () => {
    const { validateInteractivity } = await import('./validate');
    const project = branching();
    const ok = validateInteractivity(project);
    expect(ok).toEqual([]);

    // Remove the choices: the locked page becomes a dead end.
    const dead = structuredClone(project);
    dead.pages[1]!.elements = [];
    expect(validateInteractivity(dead).map((i) => i.id)).toEqual([`lock:${dead.pages[1]!.id}`]);

    const broken = structuredClone(project);
    const b = broken.pages[1]!.elements[0]!;
    b.interactions![0]!.actions = [
      { type: 'goToPage', pageId: 'pg-gone' },
      { type: 'playStep', stepId: 'st-gone' },
    ];
    if (b.type === 'button') b.label = '';
    broken.pages[1]!.elements.push(createHotspotElement({ x: 0, y: 0, width: 5, height: 5 }));
    const ids = validateInteractivity(broken).map((i) => i.id.split(':')[0]);
    expect(ids).toEqual(expect.arrayContaining(['name', 'noop', 'dangling', 'afternav']));
  });

  it('warns about unreachable pages only when the page menu is off', async () => {
    const { validateInteractivity } = await import('./validate');
    const pages = [createPage(), createPage(), createPage()];
    pages[0]!.flow = { next: 'end', lockNext: false };
    const project = createProject({ pages });
    expect(validateInteractivity(project)).toEqual([]);
    project.reader.showPageMenu = false;
    expect(validateInteractivity(project).map((i) => i.id)).toEqual([
      `unreachable:${pages[1]!.id}`,
      `unreachable:${pages[2]!.id}`,
    ]);
  });
});
