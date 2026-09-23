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
  createImageElement,
  createShapeElement,
  createTextElement,
  pageElementSchema,
  plainText,
  type AssetRef,
  type PageElement,
  type Project,
  type ShapeElement,
  type TextElement,
  type TextStyle,
} from '@/core/schema';
import { imageFilesFrom, importImageFiles } from './assets/upload';
import { docStore, useDocStore } from './store/doc-store';
import { getActivePage, getSelectedElements } from './store/selectors';
import { useUiStore } from './store/ui-store';
import { fittedTextHeight, measureTextHeight } from './text/measure';

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
  if (page) selectIds(page.elements.filter((e) => !e.hidden && !e.locked).map((e) => e.id));
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

/** Updates text style on selected text elements, growing boxes so the text still fits. */
export function updateTextStyle(patch: Partial<TextStyle>, opts: { coalesceKey?: string } = {}) {
  const page = getActivePage();
  const texts = getSelectedElements().filter((e): e is TextElement => e.type === 'text');
  if (!page || !texts.length) return;
  const heights = new Map(
    texts.map((t) => [t.id, fittedTextHeight({ ...t, style: { ...t.style, ...patch } })]),
  );
  docStore.change(
    (d) =>
      texts.forEach((t) =>
        updateElement(d, page.id, t.id, (el) => {
          if (el.type !== 'text') return;
          Object.assign(el.style, patch);
          el.height = heights.get(t.id)!;
        }),
      ),
    { label: 'Text style', coalesceKey: opts.coalesceKey },
  );
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
});
type ClipboardPayload = z.infer<typeof clipboardPayload>;

/** In-memory copy, used when the browser strips custom clipboard types. */
let memoryClipboard: ClipboardPayload | null = null;
let pasteCount = 0;

function currentPayload(): ClipboardPayload | null {
  const p = project();
  const page = getActivePage();
  const elements = getSelectedElements();
  if (!p || !page || !elements.length) return null;
  const assets: Record<string, AssetRef> = {};
  for (const el of elements) {
    if (el.type === 'image' && p.assets[el.assetId]) assets[el.assetId] = p.assets[el.assetId]!;
  }
  return { kind: 'folio-elements', pageId: page.id, elements, assets };
}

export function copySelection(e: ClipboardEvent): boolean {
  const payload = currentPayload();
  if (!payload || !e.clipboardData) return false;
  memoryClipboard = payload;
  pasteCount = 0;
  e.clipboardData.setData(CLIPBOARD_MIME, JSON.stringify(payload));
  const text = payload.elements
    .filter((el): el is TextElement => el.type === 'text')
    .map((el) => plainText(el.content))
    .join('\n\n');
  e.clipboardData.setData('text/plain', text || ' ');
  e.preventDefault();
  return true;
}

export function cutSelection(e: ClipboardEvent) {
  if (copySelection(e)) deleteSelected();
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
      .filter((el): el is TextElement => el.type === 'text')
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
    (d) => pasteElements(d, page.id, payload.elements, payload.assets, offset),
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
