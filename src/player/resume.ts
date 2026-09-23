/**
 * "Continue where you left off": the reader's position per book, best-effort. Storage can be
 * missing or throw (private windows, file:// origins, blocked site data), so every access is
 * guarded and a bad value is simply ignored.
 */
export type SavedPosition = { page: number; history: number[] };

const keyFor = (bookId: string) => `folio:resume:${bookId}`;

export function loadPosition(bookId: string, pageCount: number): SavedPosition | null {
  try {
    const raw = localStorage.getItem(keyFor(bookId));
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SavedPosition>;
    const valid = (n: unknown): n is number =>
      typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < pageCount;
    if (!valid(data.page)) return null;
    const history = Array.isArray(data.history) ? data.history.filter(valid).slice(-50) : [];
    return { page: data.page, history };
  } catch {
    return null;
  }
}

export function savePosition(bookId: string, position: SavedPosition | null): void {
  try {
    if (position && position.page > 0) {
      localStorage.setItem(keyFor(bookId), JSON.stringify(position));
    } else {
      localStorage.removeItem(keyFor(bookId));
    }
  } catch {
    // Storage unavailable: the book still works, it just starts from the beginning.
  }
}
