import { create } from 'zustand';

/**
 * Editor workspace layout: panel sizes and collapsed panels. A per-browser preference (not part
 * of any book, not in undo history), saved to localStorage.
 */
export type PanelId = 'left' | 'right' | 'bottom';

export const PANEL_LIMITS: Record<PanelId, { min: number; max: number; default: number }> = {
  left: { min: 160, max: 320, default: 184 },
  right: { min: 272, max: 480, default: 304 },
  // The timeline's max also depends on the window (60% of its height); see maxFor().
  bottom: { min: 160, max: 1200, default: 240 },
};

export function maxFor(panel: PanelId): number {
  const { max } = PANEL_LIMITS[panel];
  if (panel === 'bottom' && typeof window !== 'undefined') {
    return Math.max(PANEL_LIMITS.bottom.min, Math.min(max, Math.round(window.innerHeight * 0.6)));
  }
  return max;
}

const clamp = (panel: PanelId, v: number) =>
  Math.round(Math.min(maxFor(panel), Math.max(PANEL_LIMITS[panel].min, v)));

type Saved = { sizes: Record<PanelId, number>; collapsed: { left: boolean; right: boolean } };

const KEY = 'folio:layout';
const LEGACY_TIMELINE_KEY = 'folio-timeline-height';

function load(): Saved {
  const sizes = {
    left: PANEL_LIMITS.left.default,
    right: PANEL_LIMITS.right.default,
    bottom: PANEL_LIMITS.bottom.default,
  };
  const saved: Saved = { sizes, collapsed: { left: false, right: false } };
  try {
    const legacy = Number(localStorage.getItem(LEGACY_TIMELINE_KEY));
    if (legacy > 0) sizes.bottom = legacy;
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    for (const id of ['left', 'right', 'bottom'] as const) {
      const v = raw?.sizes?.[id];
      if (typeof v === 'number' && Number.isFinite(v)) sizes[id] = v;
    }
    saved.collapsed.left = raw?.collapsed?.left === true;
    saved.collapsed.right = raw?.collapsed?.right === true;
  } catch {
    // No saved layout: defaults.
  }
  for (const id of ['left', 'right', 'bottom'] as const) sizes[id] = clamp(id, sizes[id]);
  return saved;
}

function save(state: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ sizes: state.sizes, collapsed: state.collapsed }));
  } catch {
    // Layout just isn't remembered.
  }
}

type LayoutState = Saved & {
  setSize: (panel: PanelId, size: number, opts?: { persist?: boolean }) => void;
  reset: (panel: PanelId) => void;
  persist: () => void;
  toggle: (panel: 'left' | 'right') => void;
  /** Hides both side panels, or brings them back (Mod+\\). */
  toggleFocus: () => void;
};

export const useLayoutStore = create<LayoutState>()((set, get) => ({
  ...load(),
  setSize: (panel, size, opts) => {
    set((s) => ({ sizes: { ...s.sizes, [panel]: clamp(panel, size) } }));
    if (opts?.persist) save(get());
  },
  reset: (panel) => {
    set((s) => ({ sizes: { ...s.sizes, [panel]: PANEL_LIMITS[panel].default } }));
    save(get());
  },
  persist: () => save(get()),
  toggle: (panel) => {
    set((s) => ({ collapsed: { ...s.collapsed, [panel]: !s.collapsed[panel] } }));
    save(get());
  },
  toggleFocus: () => {
    const { left, right } = get().collapsed;
    const hide = !(left && right);
    set({ collapsed: { left: hide, right: hide } });
    save(get());
  },
}));
