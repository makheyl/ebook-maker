/** Something that plays at a moment of a click group (or, with group null, on a tapped step). */
export type Timed = { group: number | null; at: number; stepId?: string };

/**
 * Timers for a page's timed audio: when a click group plays, each of its items fires at its
 * time. Finishing a group early fires only the items `keep` accepts (voice lines queue; a
 * burst of sound effects at once would just be noise).
 */
export class AudioClock<T extends Timed> {
  private timers = new Map<T, ReturnType<typeof setTimeout>>();

  constructor(private readonly fire: (item: T) => void) {}

  schedule(items: readonly T[], group: number): void {
    for (const item of items) {
      if (item.group !== group || this.timers.has(item)) continue;
      this.timers.set(
        item,
        setTimeout(() => {
          this.timers.delete(item);
          this.fire(item);
        }, item.at),
      );
    }
  }

  /** The reader skipped ahead: fire what `keep` accepts now, in order; drop the rest. */
  flush(group: number, keep: (item: T) => boolean): void {
    const due = [...this.timers.keys()]
      .filter((i) => i.group === group)
      .sort((a, b) => a.at - b.at);
    for (const item of due) {
      clearTimeout(this.timers.get(item));
      this.timers.delete(item);
      if (keep(item)) this.fire(item);
    }
  }

  /** Items attached to a step that plays when tapped. */
  fireStep(items: readonly T[], stepId: string): void {
    for (const item of items) if (item.group === null && item.stepId === stepId) this.fire(item);
  }

  pending(match: (item: T) => boolean = () => true): boolean {
    return [...this.timers.keys()].some(match);
  }

  clear(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}
