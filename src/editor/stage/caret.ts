/** Where the double-click that started text editing happened, so the caret lands there. */
let pendingCaret: { x: number; y: number } | null = null;

export function setPendingCaret(point: { x: number; y: number } | null) {
  pendingCaret = point;
}

export function takePendingCaret() {
  const point = pendingCaret;
  pendingCaret = null;
  return point;
}
