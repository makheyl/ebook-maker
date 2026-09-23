import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer';

enablePatches();

/**
 * Patch-based undo/redo for the project document.
 *
 * Why patches (Immer) instead of snapshot history (zundo):
 * - Only the document is tracked; selection, zoom and panels never pollute history.
 * - Explicit transactions turn a whole gesture (a drag, a resize, a slider scrub) into
 *   exactly one undo step, independent of how many intermediate updates were rendered.
 * - Entries are small, serializable diffs — a good foundation for cloud sync later.
 */
export type HistoryEntry = {
  label: string;
  patches: Patch[];
  inverse: Patch[];
  coalesceKey?: string;
  time: number;
};

export type ChangeOptions = {
  label?: string;
  /** Consecutive changes with the same key (within the window) merge into one undo step. */
  coalesceKey?: string;
};

export class PatchHistory<T> {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private txn: HistoryEntry | null = null;
  private txnDepth = 0;

  constructor(
    private readonly limit = 300,
    private readonly coalesceWindowMs = 1000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Runs a recipe against `state`, records the change, and returns the next state. */
  apply(state: T, recipe: (draft: Draft<T>) => void, opts: ChangeOptions = {}): T {
    const [next, patches, inverse] = produceWithPatches(state, recipe);
    if (patches.length === 0) return state;
    this.record({
      label: opts.label ?? 'Edit',
      patches,
      inverse,
      coalesceKey: opts.coalesceKey,
      time: this.now(),
    });
    return next as T;
  }

  private record(entry: HistoryEntry): void {
    this.redoStack = [];
    if (this.txn) {
      this.txn.patches.push(...entry.patches);
      this.txn.inverse = [...entry.inverse, ...this.txn.inverse];
      return;
    }
    const top = this.undoStack[this.undoStack.length - 1];
    if (
      entry.coalesceKey &&
      top?.coalesceKey === entry.coalesceKey &&
      entry.time - top.time <= this.coalesceWindowMs
    ) {
      top.patches.push(...entry.patches);
      top.inverse = [...entry.inverse, ...top.inverse];
      top.time = entry.time;
      return;
    }
    this.undoStack.push(entry);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
  }

  /** Starts grouping every change into a single undo step until the matching commit(). */
  begin(label: string): void {
    if (this.txnDepth++ === 0) {
      this.txn = { label, patches: [], inverse: [], time: this.now() };
    }
  }

  commit(): void {
    if (this.txnDepth === 0) return;
    if (--this.txnDepth > 0) return;
    const txn = this.txn;
    this.txn = null;
    if (txn && txn.patches.length) {
      this.undoStack.push(txn);
      if (this.undoStack.length > this.limit) this.undoStack.shift();
    }
  }

  get inTransaction(): boolean {
    return this.txnDepth > 0;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0 || !!this.txn?.patches.length;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoLabel(): string | undefined {
    return this.undoStack[this.undoStack.length - 1]?.label;
  }

  get redoLabel(): string | undefined {
    return this.redoStack[this.redoStack.length - 1]?.label;
  }

  undo(state: T): T | null {
    this.flushTransaction();
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push(entry);
    return applyPatches(state as object, entry.inverse) as T;
  }

  redo(state: T): T | null {
    this.flushTransaction();
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push(entry);
    return applyPatches(state as object, entry.patches) as T;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.txn = null;
    this.txnDepth = 0;
  }

  private flushTransaction(): void {
    if (this.txnDepth > 0) {
      this.txnDepth = 1;
      this.commit();
    }
  }
}
