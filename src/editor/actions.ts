import { findElement, isGroup } from '@/core/schema/tree';
import type { Draft } from 'immer';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  alignDeltas,
  distributeDeltas,
  rotatedBounds,
  unionRects,
  type AlignEdge,
} from '@/core/geometry';
import {
  addAsset,
  addElements,
  canGroup,
  groupElements,
  ungroupElements,
  deleteElements,
  duplicateElements,
  patchElements,
  pasteElements,
  reorderElements,
  updateElement,
  type GeometryPatch,
  type LayerMove,
} from '@/core/ops';
import {
  assetRefSchema,
  characterSchema,
  createImageElement,
  createShapeElement,
  createTextElement,
  hasText,
  pageElementSchema,
  plainText,
  type AssetRef,
  type Character,
  type PageElement,
  type Project,
  type ShapeElement,
  type TextStyle,
} from '@/core/schema';
import { imageFilesFrom, importImageFiles } from './assets/upload';
import { docStore, useDocStore } from './store/doc-store';
import { getActivePage, getSelectedElements } from './store/selectors';
import { useUiStore } from './store/ui-store';
import { fitText } from './text/fit';
import { measureTextHeight } from './text/measure';

/**
 * Editor commands. Toolbar buttons, panels, context menus and keyboard shortcuts all call
 * these, so behaviour (and undo labels) stay consistent.
 */

type DraftElement = Draft<Project>['pages'][number]['elements'][number];

const project = () => docStore.project();
const ui = () => useUiStore.getState();

function selectIds(ids: string[]) {
  ui().select(ids);
}

function pageCenterBox(width: number, height: number) {
  const { width: W, height: H } = project()!.pageSize;
  return { x: (W - width) / 2, y: (H - height) / 2, width, height };
}

// ─── Insert ────────────────────────────────────────────────────────────────────

export function insertText(text = 'Add your text', opts: { edit?: boolean } = { edit: true }) {
  const p = project();
  const page = getActivePage();
  if (!p || !page) return;
  const fontSize = Math.max(16, Math.round(p.pageSize.height * 0.05));
  const width = Math.round(p.pageSize.width * 0.5);
  const el = createTextElement(text, pageCenterBox(width, fontSize * 1.4), {
    style: {
      fontFamily: p.theme.fontFamily,
      color: p.theme.textColor,
      fontSize,
      align: 'center',
    },
  });
  el.height = measureTextHeight(el);
  el.y = (p.pageSize.height - el.height) / 2;
  docStore.change((d) => addElements(d, page.id, [el]), { label: 'Add text' });
  selectIds([el.id]);
  if (opts.edit) ui().setEditingText(el.id);
}

export function insertShape(shape: ShapeElement['shape']) {
  const p = project();
  const page = getActivePage();
  if (!p || !page) return;
  const size = Math.round(Math.min(p.pageSize.width, p.pageSize.height) * 0.3);
  const box = shape === 'line' ? pageCenterBox(size * 1.5, 24) : pageCenterBox(size, size);
  const el = createShapeElement(shape, box, shape === 'line' ? {} : { fill: p.theme.accent });
  docStore.change((d) => addElements(d, page.id, [el]), { label: 'Add shape' });
  selectIds([el.id]);
}

/** Uploads images and places them on the active page (centered, or around `at`). */
export async function insertImages(files: readonly File[], at?: { x: number; y: number }) {
  const images = imageFilesFrom(files);
  if (!images.length) return;
  const toastId = toast.loading(
    images.length > 1 ? `Adding ${images.length} images…` : 'Adding image…',
  );
  const { assets, errors } = await importImageFiles(images);
  toast.dismiss(toastId);
  errors.forEach((e) => toast.error(`${e.name}: ${e.message}`));
  const p = project();
  const page = getActivePage();
  if (!p || !page || !assets.length) return;
  const { width: W, height: H } = p.pageSize;
  const elements = assets.map((asset, i) => {
    const maxW = W * 0.6;
    const maxH = H * 0.6;
    const cx = (at?.x ?? W / 2) + i * 24;
    const cy = (at?.y ?? H / 2) + i * 24;
    return createImageElement(asset, {
      x: cx - maxW / 2,
      y: cy - maxH / 2,
      width: maxW,
      height: maxH,
    });
  });
  docStore.change(
    (d) => {
      assets.forEach((a) => addAsset(d, a));
      addElements(d, page.id, elements);
    },
    { label: elements.length > 1 ? 'Add images' : 'Add image' },
  );
  selectIds(elements.map((e) => e.id));
}

// ─── Selection-wide edits ──────────────────────────────────────────────────────

export function selectAll() {
  const page = getActivePage();
  if (!page) return;
  // Inside a group being edited, "all" means that group's items.
  const entered = ui().enteredGroupId;
  const group = entered ? findElement(page.elements, entered) : undefined;
  const pool = group && isGroup(group) ? group.children : page.elements;
  selectIds(pool.filter((e) => !e.hidden && !e.locked).map((e) => e.id));
}

/** Groups the selected items (Mod+G). They must sit at the same level. */
export function groupSelected() {
  const page = getActivePage();
  const ids = ui().selectedIds;
  if (!page || ids.length < 2) return;
  if (!canGroup(page, ids)) {
    toast.error(
      'These items can’t be grouped together (they’re in different groups, or it would nest more than 3 levels).',
    );
    return;
  }
  const id = docStore.change((d) => groupElements(d, page.id, ids), { label: 'Group' });
  if (id) ui().enterGroup(ui().enteredGroupId, [id]);
}

/** Ungroups the selected groups (Mod+Shift+G); their items stay where they are. */
export function ungroupSelected() {
  const page = getActivePage();
  const groups = getSelectedElements().filter(isGroup);
  if (!page || !groups.length) return;
  const ids: string[] = [];
  let removed = 0;
  docStore.change(
    (d) => {
      for (const g of groups) {
        const result = ungroupElements(d, page.id, g.id);
        ids.push(...result.ids);
        removed += result.removedSteps;
      }
    },
    { label: 'Ungroup' },
  );
  ui().enterGroup(ui().enteredGroupId, ids);
  if (removed) {
    toast.info(
      `The group’s ${removed === 1 ? 'animation was' : `${removed} animations were`} removed with it. Undo to bring ${removed === 1 ? 'it' : 'them'} back.`,
      { duration: 6000 },
    );
  }
}

export function deleteSelected() {
  const page = getActivePage();
  const ids = ui().selectedIds;
  if (!page || !ids.length) return;
  docStore.change((d) => deleteElements(d, page.id, ids), {
    label: ids.length > 1 ? 'Delete elements' : 'Delete element',
  });
  ui().clearSelection();
}

export function duplicateSelected() {
  const page = getActivePage();
  const ids = ui().selectedIds;
  if (!page || !ids.length) return;
  const newIds = docStore.change((d) => duplicateElements(d, page.id, ids), { label: 'Duplicate' });
  if (newIds) selectIds(newIds);
}

export function nudgeSelected(dx: number, dy: number) {
  const page = getActivePage();
  const targets = getSelectedElements().filter((e) => !e.locked);
  if (!page || !targets.length) return;
  docStore.change(
    (d) =>
      patchElements(
        d,
        page.id,
        targets.map((e) => ({ id: e.id, patch: { x: e.x + dx, y: e.y + dy } })),
      ),
    { label: 'Move', coalesceKey: `nudge:${targets.map((e) => e.id).join(',')}` },
  );
}

export function reorderSelected(move: LayerMove) {
  const page = getActivePage();
  const ids = ui().selectedIds;
  if (!page || !ids.length) return;
  docStore.change((d) => reorderElements(d, page.id, ids, move), { label: 'Change layer order' });
}

export function patchSelected(
  patch: GeometryPatch,
  opts: { label?: string; coalesceKey?: string } = {},
) {
  const page = getActivePage();
  const ids = ui().selectedIds;
  if (!page || !ids.length) return;
  docStore.change(
    (d) =>
      patchElements(
        d,
        page.id,
        ids.map((id) => ({ id, patch })),
      ),
    {
      label: opts.label ?? 'Edit',
      coalesceKey: opts.coalesceKey,
    },
  );
}

export function setElementsFlag(ids: string[], flag: 'locked' | 'hidden', value: boolean) {
  const page = getActivePage();
  if (!page || !ids.length) return;
  docStore.change(
    (d) =>
      patchElements(
        d,
        page.id,
        ids.map((id) => ({ id, patch: { [flag]: value } })),
      ),
    {
      label: flag === 'locked' ? (value ? 'Lock' : 'Unlock') : value ? 'Hide' : 'Show',
    },
  );
  if (flag === 'hidden' && value) ui().select(ui().selectedIds.filter((id) => !ids.includes(id)));
}

/** Runs a type-aware recipe on every selected element (e.g. set fill on all shapes). */
export function updateSelected(
  recipe: (el: DraftElement) => void,
  opts: { label?: string; coalesceKey?: string } = {},
) {
  const page = getActivePage();
  const ids = ui().selectedIds;
  if (!page || !ids.length) return;
  docStore.change((d) => ids.forEach((id) => updateElement(d, page.id, id, recipe)), {
    label: opts.label ?? 'Edit',
    coalesceKey: opts.coalesceKey,
  });
}

/** Updates text style on selected text elements, re-fitting each box (its auto-fit rule). */
export function updateTextStyle(patch: Partial<TextStyle>, opts: { coalesceKey?: string } = {}) {
  const page = getActivePage();
  const p = project();
  const texts = getSelectedElements().filter(hasText);
  if (!page || !p || !texts.length) return;
  let shrunk = false;
  const fits = new Map(
    texts.map((t) => {
      const fit = fitText({ ...t, style: { ...t.style, ...patch } }, p.pageSize);
      shrunk ||= fit.switchedToShrink;
      return [t.id, fit];
    }),
  );
  docStore.change(
    (d) =>
      texts.forEach((t) =>
        updateElement(d, page.id, t.id, (el) => {
          if (el.type !== 'text' && el.type !== 'bubble') return;
          const fit = fits.get(t.id)!;
          el.style = fit.style;
          el.height = fit.height;
        }),
      ),
    { label: 'Text style', coalesceKey: opts.coalesceKey },
  );
  if (shrunk) toast.info('Text shrunk to fit the page', { duration: 4000 });
}

export function alignSelected(edge: AlignEdge) {
  const p = project();
  const page = getActivePage();
  const els = getSelectedElements().filter((e) => !e.locked);
  if (!p || !page || !els.length) return;
  const target =
    els.length === 1
      ? { x: 0, y: 0, width: p.pageSize.width, height: p.pageSize.height }
      : unionRects(els.map(rotatedBounds))!;
  const deltas = alignDeltas(els, edge, target);
  applyDeltas(page.id, els, deltas, 'Align');
}

export function distributeSelected(axis: 'horizontal' | 'vertical') {
  const page = getActivePage();
  const els = getSelectedElements().filter((e) => !e.locked);
  if (!page || els.length < 3) return;
  applyDeltas(page.id, els, distributeDeltas(els, axis), 'Distribute');
}

function applyDeltas(
  pageId: string,
  els: PageElement[],
  deltas: { id: string; dx: number; dy: number }[],
  label: string,
) {
  const byId = new Map(els.map((e) => [e.id, e]));
  docStore.change(
    (d) =>
      patchElements(
        d,
        pageId,
        deltas.map(({ id, dx, dy }) => ({
          id,
          patch: { x: Math.round(byId.get(id)!.x + dx), y: Math.round(byId.get(id)!.y + dy) },
        })),
      ),
    { label },
  );
}

// ─── Clipboard ─────────────────────────────────────────────────────────────────

const CLIPBOARD_MIME = 'application/x-folio-elements';
const clipboardPayload = z.object({
  kind: z.literal('folio-elements'),
  pageId: z.string(),
  elements: z.array(pageElementSchema),
  assets: z.record(z.string(), assetRefSchema),
  characters: z.record(z.string(), characterSchema).optional(),
});
type ClipboardPayload = z.infer<typeof clipboardPayload>;

/** In-memory copy, used when the browser strips custom clipboard types (and by menus). */
let memoryClipboard: ClipboardPayload | null = null;
let pasteCount = 0;
const clipboardListeners = new Set<() => void>();

function remember(payload: ClipboardPayload) {
  memoryClipboard = payload;
  pasteCount = 0;
  clipboardListeners.forEach((l) => l());
}

/** For useSyncExternalStore: menus enable Paste as soon as something is copied. */
export function subscribeAppClipboard(listener: () => void) {
  clipboardListeners.add(listener);
  return () => clipboardListeners.delete(listener);
}

function currentPayload(): ClipboardPayload | null {
  const p = project();
  const page = getActivePage();
  const elements = getSelectedElements();
  if (!p || !page || !elements.length) return null;
  const assets: Record<string, AssetRef> = {};
  const characters: Record<string, Character> = {};
  const addAsset = (id: string) => {
    if (p.assets[id]) assets[id] = p.assets[id]!;
  };
  for (const el of elements) {
    if (el.type !== 'image') continue;
    addAsset(el.assetId);
    const character = el.characterId ? p.characters[el.characterId] : undefined;
    if (character) {
      characters[character.id] = character;
      addAsset(character.assetId);
      character.poses.forEach((pose) => addAsset(pose.assetId));
    }
  }
  return { kind: 'folio-elements', pageId: page.id, elements, assets, characters };
}

export function copySelection(e: ClipboardEvent): boolean {
  const payload = currentPayload();
  if (!payload || !e.clipboardData) return false;
  remember(payload);
  e.clipboardData.setData(CLIPBOARD_MIME, JSON.stringify(payload));
  const text = payload.elements
    .filter(hasText)
    .map((el) => plainText(el.content))
    .join('\n\n');
  e.clipboardData.setData('text/plain', text || ' ');
  e.preventDefault();
  return true;
}

export function cutSelection(e: ClipboardEvent) {
  if (copySelection(e)) deleteSelected();
}

/** Copy from a menu (no clipboard event): kept in the app, plain text best-effort to the system. */
export function copyToAppClipboard(): boolean {
  const payload = currentPayload();
  if (!payload) return false;
  remember(payload);
  const text = payload.elements
    .filter(hasText)
    .map((el) => plainText(el.content))
    .join('\n\n');
  if (text) void navigator.clipboard?.writeText(text).catch(() => undefined);
  return true;
}

export function cutToAppClipboard(): void {
  if (copyToAppClipboard()) deleteSelected();
}

export const hasAppClipboard = () => memoryClipboard !== null;

/** Paste from a menu: whatever was last copied in this tab. */
export function pasteFromAppClipboard(): void {
  if (memoryClipboard) pastePayload(memoryClipboard);
}

export function pasteFromEvent(e: ClipboardEvent) {
  const data = e.clipboardData;
  if (!data) return;
  const files = imageFilesFrom(data.files);
  const raw = data.getData(CLIPBOARD_MIME);
  let payload: ClipboardPayload | null = null;
  if (raw) {
    const parsed = clipboardPayload.safeParse(safeJson(raw));
    if (parsed.success) payload = parsed.data;
  } else if (!files.length && memoryClipboard) {
    const text = data.getData('text/plain');
    const memText = memoryClipboard.elements
      .filter(hasText)
      .map((el) => plainText(el.content))
      .join('\n\n');
    if (text === (memText || ' ')) payload = memoryClipboard;
  }
  e.preventDefault();
  if (payload) return pastePayload(payload);
  if (files.length) return void insertImages(files);
  const text = data.getData('text/plain').trim();
  if (text) insertText(text.slice(0, 5000), { edit: false });
}

function pastePayload(payload: ClipboardPayload) {
  const page = getActivePage();
  if (!page) return;
  pasteCount++;
  const offset = payload.pageId === page.id ? 24 * pasteCount : 0;
  const ids = docStore.change(
    (d) => pasteElements(d, page.id, payload.elements, payload.assets, offset, payload.characters),
    {
      label: 'Paste',
    },
  );
  if (ids) selectIds(ids);
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const history = {
  undo: () => useDocStore.getState().undo(),
  redo: () => useDocStore.getState().redo(),
};
