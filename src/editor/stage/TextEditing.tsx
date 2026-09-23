import { useLayoutEffect } from 'react';
import { deleteElements, updateElement } from '@/core/ops';
import type { PageView } from '@/core/render';
import { isTextEmpty, type Paragraph, type TextElement } from '@/core/schema';
import { docStore } from '../store/doc-store';
import { getActivePage } from '../store/selectors';
import { useUiStore } from '../store/ui-store';
import { measureTextHeight } from '../text/measure';
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
    if (!nodes || !original || original.type !== 'text' || !inner) {
      useUiStore.getState().setEditingText(null);
      return;
    }
    const pageId = getActivePage()!.id;
    const textBox = inner.parentElement!;
    inner.contentEditable = 'true';
    inner.spellcheck = true;
    inner.setAttribute('role', 'textbox');
    inner.setAttribute('aria-multiline', 'true');
    inner.setAttribute('aria-label', 'Text');
    inner.classList.add('fl-editing');
    nodes.frame.classList.add('fl-editing-frame');
    inner.focus({ preventScroll: true });
    placeCaret(inner);

    const growFrame = () => {
      const needed = inner.scrollHeight + original.style.padding * 2;
      nodes.frame.style.height = `${Math.max(original.height, needed)}px`;
      textBox.style.height = '';
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
      if (isTextEmpty(content)) {
        docStore.change((d) => deleteElements(d, pageId, [original.id]), { label: 'Delete text' });
        useUiStore.getState().clearSelection();
      } else if (!sameContent(content, original.content)) {
        const height = Math.max(20, measureTextHeight({ ...original, content } as TextElement));
        docStore.change(
          (d) =>
            updateElement(d, pageId, original.id, (el) => {
              if (el.type !== 'text') return;
              el.content = content;
              el.height = height;
              if (
                el.name === 'Text' ||
                el.name === original.content[0]?.runs[0]?.text.slice(0, 32)
              ) {
                el.name =
                  content[0]?.runs
                    .map((r) => r.text)
                    .join('')
                    .trim()
                    .slice(0, 32) || 'Text';
              }
            }),
          { label: 'Edit text' },
        );
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
