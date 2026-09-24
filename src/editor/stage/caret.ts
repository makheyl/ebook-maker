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

/**
 * Puts the keyboard back in the text being edited (all of it selected), e.g. after a menu that
 * started the editing closes and would otherwise take focus with it.
 */
export function refocusEditingText(): void {
  const inner = document.querySelector<HTMLElement>('.fl-mode-editor .fl-text-inner.fl-editing');
  if (!inner) return;
  inner.focus({ preventScroll: true });
  const range = document.createRange();
  range.selectNodeContents(inner);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
}
