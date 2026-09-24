import { create } from 'zustand';

export type RightTab = 'design' | 'animate' | 'interact' | 'layers';
export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';
export type Zoom = 'fit' | number;

/** Transient editor UI state. Never part of the document or the undo history. */
type UiState = {
  activePageId: string | null;
  selectedIds: string[];
  editingTextId: string | null;
  zoom: Zoom;
  /** The effective scale the stage is rendered at (resolved from `zoom`). */
  scale: number;
  rightTab: RightTab;
  saveStatus: SaveStatus;
  saveError: string | null;
  /** An Animation Pane preview is playing on the stage (disables editing overlays). */
  previewing: boolean;
  /** The full-screen reader preview is open (editor shortcuts are suspended). */
  playerOpen: boolean;
  /** Showing the draggable pivot (feet) handle for the selected character. */
  editingPivot: boolean;
  /** The page timeline dock is open. */
  timelineOpen: boolean;
  /** Timeline playhead: a time within a click group. */
  playhead: { group: number; ms: number };
  /** Step selected on the timeline / Animation Pane. */
  selectedStepId: string | null;
  /** The group being edited (double-clicked into): its children are what clicks select. */
  enteredGroupId: string | null;
};

type UiActions = {
  reset: (activePageId: string | null) => void;
  setActivePage: (pageId: string) => void;
  select: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  setEditingText: (id: string | null) => void;
  setZoom: (zoom: Zoom) => void;
  setScale: (scale: number) => void;
  setRightTab: (tab: RightTab) => void;
  setSaveStatus: (status: SaveStatus, error?: string | null) => void;
  setPreviewing: (previewing: boolean) => void;
  setPlayerOpen: (open: boolean) => void;
  setEditingPivot: (on: boolean) => void;
  setTimelineOpen: (open: boolean) => void;
  setPlayhead: (playhead: { group: number; ms: number }) => void;
  setSelectedStep: (id: string | null) => void;
  enterGroup: (groupId: string | null, select?: string[]) => void;
};

export const useUiStore = create<UiState & UiActions>()((set) => ({
  activePageId: null,
  selectedIds: [],
  editingTextId: null,
  zoom: 'fit',
  scale: 1,
  rightTab: 'design',
  saveStatus: 'saved',
  saveError: null,
  previewing: false,
  playerOpen: false,
  editingPivot: false,
  timelineOpen: false,
  playhead: { group: 0, ms: 0 },
  selectedStepId: null,
  enteredGroupId: null,

  enterGroup: (enteredGroupId, select) =>
    set((s) => ({
      enteredGroupId,
      selectedIds: select ?? s.selectedIds,
      editingTextId: null,
      editingPivot: false,
    })),
  setTimelineOpen: (timelineOpen) => set({ timelineOpen }),
  setPlayhead: (playhead) => set({ playhead }),
  setSelectedStep: (selectedStepId) => set({ selectedStepId }),
  setPlayerOpen: (playerOpen) => set({ playerOpen }),
  setEditingPivot: (editingPivot) => set({ editingPivot }),
  reset: (activePageId) =>
    set({
      activePageId,
      selectedIds: [],
      editingTextId: null,
      zoom: 'fit',
      rightTab: 'design',
      saveStatus: 'saved',
      saveError: null,
      previewing: false,
      editingPivot: false,
      playhead: { group: 0, ms: 0 },
      selectedStepId: null,
      enteredGroupId: null,
    }),
  setActivePage: (activePageId) =>
    set({
      activePageId,
      selectedIds: [],
      editingTextId: null,
      editingPivot: false,
      playhead: { group: 0, ms: 0 },
      selectedStepId: null,
      enteredGroupId: null,
    }),
  select: (selectedIds) => set({ selectedIds, editingTextId: null, editingPivot: false }),
  toggleSelect: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((x) => x !== id)
        : [...s.selectedIds, id],
      editingTextId: null,
    })),
  clearSelection: () =>
    set({ selectedIds: [], editingTextId: null, editingPivot: false, enteredGroupId: null }),
  setEditingText: (editingTextId) =>
    set((s) => ({ editingTextId, selectedIds: editingTextId ? [editingTextId] : s.selectedIds })),
  setZoom: (zoom) => set({ zoom }),
  setScale: (scale) => set({ scale }),
  setRightTab: (rightTab) => set({ rightTab }),
  setSaveStatus: (saveStatus, saveError = null) => set({ saveStatus, saveError }),
  setPreviewing: (previewing) => set({ previewing }),
}));
