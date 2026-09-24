import { parentOf } from '@/core/schema/tree';
import { useLayoutStore } from './layout/layout-store';
import { useEffect } from 'react';
import {
  copySelection,
  cutSelection,
  deleteSelected,
  duplicateSelected,
  groupSelected,
  ungroupSelected,
  history,
  nudgeSelected,
  pasteFromEvent,
  reorderSelected,
  selectAll,
} from './actions';
import { stopPreview } from './animation/preview';
import { endScrub } from './timeline/session';
import { stepZoom } from './stage/zoom';
import { getActivePage, getSelectedElements } from './store/selectors';
import { useUiStore } from './store/ui-store';

/** True when the key event belongs to a text field, editable text or an open dialog/menu. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.closest('input, textarea, select, [role="dialog"], [role="menu"], [role="listbox"]'))
    return true;
  return false;
}

/**
 * Global editor shortcuts: delete, duplicate (⌘D), copy/cut/paste, undo/redo, arrow-key
 * nudge (Shift = 10px), select all, layer order (⌘[ / ⌘]), zoom (⌘+ / ⌘- / ⌘0), Esc.
 */
export function useEditorShortcuts(opts: { onPreview: () => void }): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const ui = useUiStore.getState();
      if (ui.playerOpen) return;

      // Undo/redo work everywhere except inside text inputs (which have their own undo).
      if (mod && key === 'z' && !isTypingTarget(e.target)) {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
        return;
      }
      if (mod && key === 'y' && !isTypingTarget(e.target)) {
        e.preventDefault();
        history.redo();
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (ui.previewing) {
        if (e.key === 'Escape') {
          stopPreview();
          endScrub();
        }
        return;
      }

      if (mod && (key === '=' || key === '+')) {
        e.preventDefault();
        ui.setZoom(stepZoom(ui.scale, 1));
        return;
      }
      if (mod && key === '-') {
        e.preventDefault();
        ui.setZoom(stepZoom(ui.scale, -1));
        return;
      }
      if (mod && key === '0') {
        e.preventDefault();
        ui.setZoom('fit');
        return;
      }
      if (mod && key === 'a') {
        e.preventDefault();
        selectAll();
        return;
      }
      if (mod && key === 'g') {
        e.preventDefault();
        if (e.shiftKey) ungroupSelected();
        else groupSelected();
        return;
      }
      if (mod && key === 'd') {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (mod && e.key === ']') {
        e.preventDefault();
        reorderSelected(e.altKey || e.shiftKey ? 'front' : 'forward');
        return;
      }
      if (mod && e.key === '[') {
        e.preventDefault();
        reorderSelected(e.altKey || e.shiftKey ? 'back' : 'backward');
        return;
      }
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        opts.onPreview();
        return;
      }
      if (mod && e.key === '\\') {
        // Focus mode: hide (or bring back) both side panels.
        e.preventDefault();
        useLayoutStore.getState().toggleFocus();
        return;
      }
      if (mod) return;

      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        ui.setTimelineOpen(!ui.timelineOpen);
        return;
      }

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          if (ui.selectedIds.length) {
            e.preventDefault();
            deleteSelected();
          }
          return;
        case 'Escape':
          // Inside a group: go up a level (select the group). Otherwise clear the selection.
          if (ui.enteredGroupId) {
            e.preventDefault();
            const page = getActivePage();
            const parent = page ? parentOf(page.elements, ui.enteredGroupId) : null;
            ui.enterGroup(parent?.id ?? null, [ui.enteredGroupId]);
          } else if (ui.selectedIds.length) {
            e.preventDefault();
            ui.clearSelection();
          }
          return;
        case 'Enter': {
          const [only, ...rest] = getSelectedElements();
          if (only && !rest.length && only.type === 'group') {
            // Enter a group: select its items.
            e.preventDefault();
            ui.enterGroup(
              only.id,
              only.children.filter((c) => !c.hidden).map((c) => c.id),
            );
            return;
          }
          if (
            only &&
            !rest.length &&
            (only.type === 'text' || only.type === 'bubble') &&
            !only.locked
          ) {
            e.preventDefault();
            ui.setEditingText(only.id);
          }
          return;
        }
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight': {
          if (!ui.selectedIds.length) return;
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          nudgeSelected(dx, dy);
          return;
        }
      }
    };

    const onCopy = (e: ClipboardEvent) => {
      if (!isTypingTarget(e.target) && !hasTextSelection()) copySelection(e);
    };
    const onCut = (e: ClipboardEvent) => {
      if (!isTypingTarget(e.target) && !hasTextSelection()) cutSelection(e);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!isTypingTarget(e.target) && !useUiStore.getState().playerOpen) pasteFromEvent(e);
    };

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
  }, [opts]);
}

function hasTextSelection(): boolean {
  const sel = window.getSelection();
  return !!sel && !sel.isCollapsed && sel.toString().length > 0;
}
