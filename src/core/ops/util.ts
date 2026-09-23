import { current, isDraft, type Draft } from 'immer';

/** Moves an item within an array in place (clamping the target index). */
export function arrayMove<T>(list: T[], from: number, to: number): void {
  if (from < 0 || from >= list.length) return;
  const target = Math.max(0, Math.min(to, list.length - 1));
  if (from === target) return;
  const [item] = list.splice(from, 1);
  list.splice(target, 0, item as T);
}

/** Snapshot of a (possibly Immer-drafted) value that is safe to structuredClone. */
export function plain<T>(value: T): T {
  // Immer drafts are Proxies, which structuredClone rejects; `current` snapshots them.
  return isDraft(value) ? (current(value as Draft<T>) as T) : value;
}
