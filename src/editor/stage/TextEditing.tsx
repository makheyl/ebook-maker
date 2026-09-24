import { useLayoutEffect } from 'react';
import { deleteElements, updateElement } from '@/core/ops';
import type { PageView } from '@/core/render';
import { bubbleInset } from '@/core/render/bubble-geometry';
import { hasText, isTextEmpty, type Paragraph, type TextLike } from '@/core/schema';
import { docStore } from '../store/doc-store';
import { getActivePage } from '../store/selectors';
import { useUiStore } from '../store/ui-store';
import { toast } from 'sonner';
import { autofitOf, MIN_FIT_SCALE, MIN_TEXT_HEIGHT } from '@/core/text/autofit';
import { fitText } from '../text/fit';
import { parseEditable } from '../text/parse-editable';
import { takePendingCaret } from './caret';

function placeCaret(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  const point = takePendingCaret();
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  const pos = point && doc.caretPositionFromPoint?.(point.x, point.y);
  const legacy = point && !pos ? document.caretRangeFromPoint?.(point.x, point.y) : null;
  if (pos && root.contains(pos.offsetNode)) {
    range.setStart(pos.offsetNode, pos.offset);
    range.collapse(true);
  } else if (legacy && root.contains(legacy.startContainer)) {
    range.setStart(legacy.startContainer, legacy.startOffset);
    range.collapse(true);
  } else {
    range.selectNodeContents(root);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

function sameContent(a: readonly Paragraph[], b: readonly Paragraph[]) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Inline text editing directly on the stage: the element's own rendered text becomes
 * contentEditable (so what you type is exactly what the book shows), and on exit the DOM is
 * parsed back into structured runs and the element is re-rendered from data.
 */
export function TextEditing({ view }: { view: PageView | null }) {
  const editingId = useUiStore((s) => s.editingTextId);

  useLayoutEffect(() => {
    if (!editingId || !view) return;
    const nodes = view.getNodes(editingId);
    const original = nodes?.element;
    const inner = nodes?.anim.querySelector<HTMLElement>('.fl-text-inner');
    if (!nodes || !original || !hasText(original) || !inner) {
      useUiStore.getState().setEditingText(null);
      return;
    }
    const pageId = getActivePage()!.id;
    const textBox = inner.parentElement!;
    inner.contentEditable = 'true';
    inner.spellcheck = true;
    inner.setAttribute('role', 'textbox');
    inner.setAttribute('aria-multiline', 'true');
    inner.setAttribute('aria-label', original.type === 'bubble' ? 'Bubble text' : 'Text');
    inner.classList.add('fl-editing');
    nodes.frame.classList.add('fl-editing-frame');
    inner.focus({ preventScroll: true });
    placeCaret(inner);

    // Live fit while typing, following the box's auto-fit rule: grow (but never past the page
    // bottom — then shrink), shrink within the box, or stay fixed. The exact result is measured
    // again and stored when editing ends.
    // A bubble fits its text inside the balloon (less the shape's inset) and grows only when
    // editing ends, so live typing just shrinks the text to the balloon.
    const pageHeight = docStore.project()?.pageSize.height ?? Infinity;
    const bubble = original.type === 'bubble';
    const mode =
      bubble && autofitOf(original.style) === 'grow' ? 'shrink' : autofitOf(original.style);
    const baseSize = original.style.fontSize;
    const insetY = bubble
      ? bubbleInset(original.bubble.shape, original.width, original.height).y * 2
      : 0;
    const room = Math.max(MIN_TEXT_HEIGHT * 2, pageHeight - Math.max(0, original.y));
    const needed = () => inner.scrollHeight + original.style.padding * 2;
    const growFrame = () => {
      if (mode === 'none') return;
      const maxHeight = mode === 'grow' ? room : original.height - insetY;
      textBox.style.fontSize = `${baseSize}px`;
      if (mode === 'grow' && needed() <= maxHeight) {
        nodes.frame.style.height = `${Math.max(original.height, needed())}px`;
        return;
      }
      if (!bubble) nodes.frame.style.height = `${maxHeight}px`;
      let lo = MIN_FIT_SCALE;
      let hi = 1;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        textBox.style.fontSize = `${baseSize * mid}px`;
        if (needed() <= maxHeight) lo = mid;
        else hi = mid;
      }
      textBox.style.fontSize = `${baseSize * lo}px`;
    };

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      inner.removeEventListener('keydown', onKeyDown);
      inner.removeEventListener('blur', onBlur);
      inner.removeEventListener('paste', onPaste);
      inner.removeEventListener('input', growFrame);
      inner.removeAttribute('contenteditable');
      inner.classList.remove('fl-editing');
      nodes.frame.classList.remove('fl-editing-frame');
      const content = parseEditable(inner);
      if (isTextEmpty(content) && !bubble) {
        docStore.change((d) => deleteElements(d, pageId, [original.id]), { label: 'Delete text' });
        useUiStore.getState().clearSelection();
      } else if (!sameContent(content, original.content)) {
        const size = docStore.project()!.pageSize;
        const fit = fitText({ ...original, content } as TextLike, size);
        const fallbackName = bubble ? original.name : 'Text';
        docStore.change(
          (d) =>
            updateElement(d, pageId, original.id, (el) => {
              if (el.type !== 'text' && el.type !== 'bubble') return;
              el.content = content;
              el.height = fit.height;
              el.style = fit.style;
              if (
                el.name === 'Text' ||
                el.name === original.content[0]?.runs[0]?.text.slice(0, 32)
              ) {
                el.name =
                  content[0]?.runs
                    .map((r) => r.text)
                    .join('')
                    .trim()
                    .slice(0, 32) || fallbackName;
              }
            }),
          { label: bubble ? 'Edit bubble' : 'Edit text' },
        );
        if (fit.switchedToShrink) toast.info('Text shrunk to fit the page', { duration: 4000 });
      } else {
        view.rerender(original.id);
      }
      if (useUiStore.getState().editingTextId === original.id) {
        useUiStore.getState().setEditingText(null);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        inner.blur();
      }
    };
    const onBlur = () => finish();
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const text = e.clipboardData?.getData('text/plain') ?? '';
      // Plain text only: formatting from other apps never enters the document.
      document.execCommand('insertText', false, text);
    };
    inner.addEventListener('keydown', onKeyDown);
    inner.addEventListener('blur', onBlur);
    inner.addEventListener('paste', onPaste);
    inner.addEventListener('input', growFrame);
    return finish;
  }, [editingId, view]);

  return null;
}
