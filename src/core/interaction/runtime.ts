import { groupCount } from '../animation/schedule';
import type { BurstEffect, Page, Project, StoryAction } from '../schema/types';

/**
 * The reader's story logic as a pure state machine: pages, click groups, branching history,
 * locked pages, one-time taps and collectibles. The Player turns DOM input into events and
 * carries out the returned effects, so all of this is unit-tested without a browser.
 */
export type ReaderState = {
  page: number;
  group: number;
  /** Pages visited before the current one (for "back" after branching). */
  history: number[];
  /** Pages whose "next" has been unlocked. */
  unlocked: string[];
  /** Interactions marked "once" that have been used. */
  consumed: string[];
  /** Collected elements per page. */
  collected: Record<string, string[]>;
  ended: boolean;
};

export type ReaderEvent =
  | { type: 'next'; groupRunning?: boolean }
  | { type: 'prev' }
  /** `direction` 0 shows the page at once and plays it from the start. */
  | { type: 'goto'; page: number; direction?: 1 | -1 | 0 }
  | { type: 'tap'; elementId: string; groupRunning?: boolean }
  | { type: 'restart' };

export type ReaderEffect =
  | { type: 'showPage'; page: number; direction: 1 | -1 | 0 }
  | { type: 'playGroup'; group: number }
  | { type: 'finishGroup'; group: number }
  | { type: 'playStep'; stepId: string }
  | { type: 'burst'; effect: BurstEffect; elementId: string }
  | { type: 'collect'; elementId: string; count: number; goal: number }
  | { type: 'hint' }
  | { type: 'unlocked' }
  | { type: 'showEnd' }
  | { type: 'hideEnd' }
  | { type: 'playSound'; soundId: string };

export type ReduceResult = { state: ReaderState; effects: ReaderEffect[] };

export function initialReaderState(page = 0): ReaderState {
  return { page, group: 0, history: [], unlocked: [], consumed: [], collected: {}, ended: false };
}

const groupsOf = (page: Page) => groupCount(page.animations);

/** Whether "next" may leave the page (unlocked, or the goal reached). */
export function isNextLocked(project: Project, state: ReaderState): boolean {
  const page = project.pages[state.page];
  if (!page?.flow?.lockNext) return false;
  return !state.unlocked.includes(page.id);
}

/** Where "next" leads from a page: another page index, or 'end'. */
export function nextTarget(project: Project, pageIndex: number): number | 'end' {
  const page = project.pages[pageIndex]!;
  const next = page.flow?.next;
  if (next === 'end') return 'end';
  if (next) {
    const i = project.pages.findIndex((p) => p.id === next);
    if (i >= 0) return i;
  }
  return pageIndex + 1 < project.pages.length ? pageIndex + 1 : 'end';
}

function show(
  state: ReaderState,
  project: Project,
  target: number,
  direction: 1 | -1 | 0,
  pushHistory: boolean,
): ReduceResult {
  const page = project.pages[target]!;
  return {
    state: {
      ...state,
      page: target,
      // Arriving backwards shows the page as it ends.
      group: direction === -1 ? groupsOf(page) - 1 : 0,
      history: pushHistory ? [...state.history, state.page] : state.history,
      ended: false,
    },
    effects: [{ type: 'showPage', page: target, direction }],
  };
}

function next(project: Project, state: ReaderState, groupRunning = false): ReduceResult {
  if (state.ended) return { state, effects: [] };
  const page = project.pages[state.page]!;
  if (groupRunning) return { state, effects: [{ type: 'finishGroup', group: state.group }] };
  if (state.group + 1 < groupsOf(page)) {
    const group = state.group + 1;
    return { state: { ...state, group }, effects: [{ type: 'playGroup', group }] };
  }
  if (isNextLocked(project, state)) return { state, effects: [{ type: 'hint' }] };
  const target = nextTarget(project, state.page);
  if (target === 'end') return { state: { ...state, ended: true }, effects: [{ type: 'showEnd' }] };
  return show(state, project, target, 1, true);
}

function prev(project: Project, state: ReaderState): ReduceResult {
  if (state.ended) return { state: { ...state, ended: false }, effects: [{ type: 'hideEnd' }] };
  if (state.history.length) {
    const target = state.history[state.history.length - 1]!;
    return show({ ...state, history: state.history.slice(0, -1) }, project, target, -1, false);
  }
  if (state.page > 0) return show(state, project, state.page - 1, -1, false);
  return { state, effects: [] };
}

function goto(
  project: Project,
  state: ReaderState,
  target: number,
  direction: 1 | -1 | 0 = target > state.page ? 1 : -1,
): ReduceResult {
  if (target < 0 || target >= project.pages.length || (target === state.page && !state.ended)) {
    return { state, effects: [] };
  }
  const result = show(state, project, target, direction, true);
  if (state.ended) result.effects.unshift({ type: 'hideEnd' });
  return result;
}

function restart(): ReduceResult {
  return {
    state: initialReaderState(0),
    effects: [{ type: 'hideEnd' }, { type: 'showPage', page: 0, direction: 0 }],
  };
}

function tap(
  project: Project,
  state: ReaderState,
  elementId: string,
  groupRunning: boolean,
): ReduceResult {
  const page = project.pages[state.page]!;
  const element = page.elements.find((e) => e.id === elementId && !e.hidden);
  const interactions = (element?.interactions ?? []).filter((i) => !state.consumed.includes(i.id));
  let current: ReduceResult = { state, effects: [] };
  const run = (action: StoryAction): boolean => {
    const s = current.state;
    const add = (r: ReduceResult) => {
      current = { state: r.state, effects: [...current.effects, ...r.effects] };
    };
    switch (action.type) {
      case 'next':
        add(next(project, s, groupRunning));
        return s.page !== current.state.page || current.state.ended;
      case 'prev':
        add(prev(project, s));
        return true;
      case 'firstPage':
        add(restart());
        return true;
      case 'goToPage': {
        const i = project.pages.findIndex((p) => p.id === action.pageId);
        if (i >= 0) add(goto(project, s, i));
        return i >= 0;
      }
      case 'playStep':
        add({ state: s, effects: [{ type: 'playStep', stepId: action.stepId }] });
        return false;
      case 'unlockNext':
        add({
          state: s.unlocked.includes(page.id) ? s : { ...s, unlocked: [...s.unlocked, page.id] },
          effects: [{ type: 'unlocked' }],
        });
        return false;
      case 'burst':
        add({ state: s, effects: [{ type: 'burst', effect: action.effect, elementId }] });
        return false;
      case 'playSound':
        add({ state: s, effects: [{ type: 'playSound', soundId: action.soundId }] });
        return false;
      case 'collect': {
        const got = s.collected[page.id] ?? [];
        if (got.includes(elementId)) return false;
        const collected = [...got, elementId];
        const goal = page.goal?.count ?? 0;
        let next: ReaderState = { ...s, collected: { ...s.collected, [page.id]: collected } };
        const effects: ReaderEffect[] = [
          { type: 'collect', elementId, count: collected.length, goal },
        ];
        if (goal && collected.length >= goal && !next.unlocked.includes(page.id)) {
          next = { ...next, unlocked: [...next.unlocked, page.id] };
          effects.push({ type: 'unlocked' }, { type: 'burst', effect: 'confetti', elementId });
        }
        add({ state: next, effects });
        return false;
      }
    }
  };
  for (const interaction of interactions) {
    if (interaction.once) {
      current = {
        state: { ...current.state, consumed: [...current.state.consumed, interaction.id] },
        effects: current.effects,
      };
    }
    for (const action of interaction.actions) {
      // Once the reader has been taken to another page, the rest of the actions don't apply.
      if (run(action)) return current;
    }
  }
  return current;
}

export function reduce(project: Project, state: ReaderState, event: ReaderEvent): ReduceResult {
  switch (event.type) {
    case 'next':
      return next(project, state, event.groupRunning);
    case 'prev':
      return prev(project, state);
    case 'goto':
      return goto(project, state, event.page, event.direction);
    case 'restart':
      return restart();
    case 'tap':
      return tap(project, state, event.elementId, !!event.groupRunning);
  }
}
