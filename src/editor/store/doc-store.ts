import type { Draft } from 'immer';
import { create } from 'zustand';
import { PatchHistory, type ChangeOptions } from '@/core/history/patch-history';
import type { Project } from '@/core/schema';

/**
 * The document store: the open project plus its undo history.
 * All edits go through `change`, which runs a core op (Immer recipe) and records patches.
 */
type DocState = {
  project: Project | null;
  /** Increments on every document change; autosave compares it with the saved revision. */
  revision: number;
  canUndo: boolean;
  canRedo: boolean;
};

type DocActions = {
  load: (project: Project) => void;
  unload: () => void;
  /** Applies a recipe as one undoable change. Returns whatever the recipe returns. */
  change: <R>(recipe: (draft: Draft<Project>) => R, opts?: ChangeOptions) => R | undefined;
  /** Replaces the project without recording history (e.g. after a save stamps updatedAt). */
  replaceSilently: (project: Project) => void;
  /** Group all changes until `commitGesture` into a single undo step (drags, slider scrubs). */
  beginGesture: (label: string) => void;
  commitGesture: () => void;
  undo: () => void;
  redo: () => void;
};

const history = new PatchHistory<Project>();

const flags = () => ({ canUndo: history.canUndo, canRedo: history.canRedo });

export const useDocStore = create<DocState & DocActions>()((set, get) => ({
  project: null,
  revision: 0,
  canUndo: false,
  canRedo: false,

  load: (project) => {
    history.clear();
    set({ project, revision: 0, ...flags() });
  },

  unload: () => {
    history.clear();
    set({ project: null, revision: 0, ...flags() });
  },

  change: (recipe, opts) => {
    const current = get().project;
    if (!current) return undefined;
    let result: ReturnType<typeof recipe> | undefined;
    // Wrap so the recipe's return value is never mistaken for a replacement draft by Immer.
    const next = history.apply(
      current,
      (draft) => {
        result = recipe(draft);
      },
      opts,
    );
    if (next !== current) set({ project: next, revision: get().revision + 1, ...flags() });
    return result;
  },

  replaceSilently: (project) => set({ project }),

  beginGesture: (label) => history.begin(label),

  commitGesture: () => {
    history.commit();
    set(flags());
  },

  undo: () => {
    const current = get().project;
    if (!current) return;
    const next = history.undo(current);
    if (next) set({ project: next, revision: get().revision + 1, ...flags() });
  },

  redo: () => {
    const current = get().project;
    if (!current) return;
    const next = history.redo(current);
    if (next) set({ project: next, revision: get().revision + 1, ...flags() });
  },
}));

/** Non-React access for event handlers and imperative code. */
export const docStore = {
  get: () => useDocStore.getState(),
  project: () => useDocStore.getState().project,
  change: <R>(recipe: (draft: Draft<Project>) => R, opts?: ChangeOptions) =>
    useDocStore.getState().change(recipe, opts),
};
