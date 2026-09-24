import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Eye,
  EyeOff,
  FilePlus2,
  Lock,
  LockOpen,
  MousePointerClick,
  Paintbrush,
  Scissors,
  Sparkles,
  SquareDashedMousePointer,
  Trash2,
} from 'lucide-react';
import { useSyncExternalStore } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/ui/context-menu';
import {
  copyToAppClipboard,
  cutToAppClipboard,
  deleteSelected,
  duplicateSelected,
  hasAppClipboard,
  pasteFromAppClipboard,
  reorderSelected,
  selectAll,
  setElementsFlag,
  subscribeAppClipboard,
} from '../actions';
import { MOD } from '../keys';
import { useLayoutStore } from '../layout/layout-store';
import { pageActions } from '../sidebar/page-actions';
import { docStore } from '../store/doc-store';
import { getActivePage, useSelectedElements } from '../store/selectors';
import { useUiStore, type RightTab } from '../store/ui-store';

const SHIFT = MOD === '⌘' ? '⇧' : 'Shift+';

const useHasClipboard = () => useSyncExternalStore(subscribeAppClipboard, hasAppClipboard);

/** Opens a right-panel tab, bringing the panel back if it was hidden. */
function openTab(tab: RightTab) {
  if (useLayoutStore.getState().collapsed.right) useLayoutStore.getState().toggle('right');
  useUiStore.getState().setRightTab(tab);
}

/** The standard edit / arrange / lock items for the current selection. */
export function SelectionMenuItems() {
  const selected = useSelectedElements();
  const ids = selected.map((e) => e.id);
  const allLocked = selected.length > 0 && selected.every((e) => e.locked);
  const canPaste = useHasClipboard();
  return (
    <>
      <ContextMenuItem onSelect={() => cutToAppClipboard()}>
        <Scissors /> Cut <ContextMenuShortcut>{MOD}X</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => copyToAppClipboard()}>
        <Copy /> Copy <ContextMenuShortcut>{MOD}C</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem disabled={!canPaste} onSelect={() => pasteFromAppClipboard()}>
        <ClipboardPaste /> Paste <ContextMenuShortcut>{MOD}V</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => duplicateSelected()}>
        <CopyPlus /> Duplicate <ContextMenuShortcut>{MOD}D</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem variant="destructive" onSelect={() => deleteSelected()}>
        <Trash2 /> Delete <ContextMenuShortcut>Del</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => reorderSelected('front')}>
        <ArrowUpToLine /> Bring to front
        <ContextMenuShortcut>
          {MOD}
          {SHIFT}]
        </ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => reorderSelected('forward')}>
        <ChevronUp /> Bring forward <ContextMenuShortcut>{MOD}]</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => reorderSelected('backward')}>
        <ChevronDown /> Send backward <ContextMenuShortcut>{MOD}[</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => reorderSelected('back')}>
        <ArrowDownToLine /> Send to back
        <ContextMenuShortcut>
          {MOD}
          {SHIFT}[
        </ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => setElementsFlag(ids, 'locked', !allLocked)}>
        {allLocked ? <LockOpen /> : <Lock />} {allLocked ? 'Unlock' : 'Lock'}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => setElementsFlag(ids, 'hidden', true)}>
        <EyeOff /> Hide
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => openTab('animate')}>
        <Sparkles /> Animate…
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => openTab('interact')}>
        <MousePointerClick /> Add tap action…
      </ContextMenuItem>
    </>
  );
}

function CanvasMenuItems() {
  const canPaste = useHasClipboard();
  return (
    <>
      <ContextMenuItem disabled={!canPaste} onSelect={() => pasteFromAppClipboard()}>
        <ClipboardPaste /> Paste <ContextMenuShortcut>{MOD}V</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => selectAll()}>
        <SquareDashedMousePointer /> Select all <ContextMenuShortcut>{MOD}A</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onSelect={() => {
          useUiStore.getState().clearSelection();
          openTab('design');
        }}
      >
        <Paintbrush /> Page background…
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() => {
          const page = getActivePage();
          const index = docStore.project()?.pages.findIndex((p) => p.id === page?.id) ?? -1;
          pageActions.add(index >= 0 ? index : undefined);
        }}
      >
        <FilePlus2 /> Add page after
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => useLayoutStore.getState().toggleFocus()}>
        <Eye /> Show or hide panels <ContextMenuShortcut>{MOD}\</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  );
}

/**
 * Right-click menu for the stage: acts on the element under the pointer (selecting it first,
 * as design apps do), or offers page actions on empty canvas. Opens with the keyboard too
 * (Menu key / Shift+F10).
 */
export function StageContextMenu({ children }: { children: React.ReactNode }) {
  const selected = useSelectedElements();
  return (
    <ContextMenu>
      <ContextMenuTrigger
        asChild
        onContextMenu={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('[contenteditable="true"]')) {
            // Let the browser's own menu handle text editing (spelling, copy…).
            e.stopPropagation();
            return;
          }
          const frame = target.closest<HTMLElement>('.fl-mode-editor .fl-el[data-element-id]');
          const ui = useUiStore.getState();
          if (frame) {
            const id = frame.dataset.elementId!;
            if (!ui.selectedIds.includes(id)) ui.select([id]);
          } else if (!target.closest('[data-stage-control], .moveable-control-box')) {
            ui.clearSelection();
          }
        }}
      >
        <div className="flex min-w-0 flex-1">{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent data-testid="context-menu">
        {selected.length ? <SelectionMenuItems /> : <CanvasMenuItems />}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** The same selection menu on a layer row (the row is selected first). */
export function LayerContextMenu({
  elementId,
  children,
}: {
  elementId: string;
  children: React.ReactElement;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger
        asChild
        onContextMenu={() => {
          const ui = useUiStore.getState();
          if (!ui.selectedIds.includes(elementId)) ui.select([elementId]);
        }}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent data-testid="context-menu">
        <SelectionMenuItems />
      </ContextMenuContent>
    </ContextMenu>
  );
}
