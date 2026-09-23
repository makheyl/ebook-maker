import type { AssetRef, Page, PageElement, PageSize } from '../schema/types';
import { buildImage, buildShape, buildText, type AssetResolver } from './nodes';
import { backgroundCss, filterCss } from './styles';

/**
 * The one renderer. Editor stage, thumbnails, in-app preview and the exported player all
 * draw pages through a PageView, which is what guarantees they look the same.
 *
 * Each element is three nested layers:
 *   .fl-el    (frame)   – position, size, rotation, opacity. The editor's transform handles target this.
 *   .fl-anim  (anim)    – the only layer the animation runtime touches (transform/opacity/clip).
 *   content             – text, image or shape.
 * Keeping layout and animation transforms on separate layers means they never fight.
 */

export type RenderMode = 'editor' | 'player' | 'thumbnail';

export type PageViewOptions = {
  pageSize: PageSize;
  mode: RenderMode;
  resolveAsset: AssetResolver;
  /** Element ids whose text should be split into per-character spans (typewriter). */
  splitTextFor?: (page: Page) => ReadonlySet<string>;
};

export type ElementNodes = { frame: HTMLElement; anim: HTMLElement; element: PageElement };

export type PageView = {
  readonly root: HTMLElement;
  update(page: Page, assets: Readonly<Record<string, AssetRef>>): void;
  /** Forces image nodes to re-resolve their URLs (e.g. after assets finished loading). */
  refreshAssets(): void;
  /** Rebuilds one element's content from data (e.g. to discard DOM edits after inline editing). */
  rerender(elementId: string): void;
  getNodes(elementId: string): ElementNodes | undefined;
  readonly page: Page | null;
  destroy(): void;
};

type Entry = ElementNodes & { assetRef: AssetRef | undefined; split: boolean };

function applyFrame(frame: HTMLElement, el: PageElement, mode: RenderMode) {
  const s = frame.style;
  s.left = `${el.x}px`;
  s.top = `${el.y}px`;
  s.width = `${el.width}px`;
  s.height = `${el.height}px`;
  s.transform = el.rotation ? `rotate(${el.rotation}deg)` : '';
  s.opacity = el.opacity === 1 ? '' : String(el.opacity);
  s.display = el.hidden ? 'none' : '';
  frame.dataset.type = el.type;
  if (mode === 'editor') {
    frame.dataset.name = el.name;
    frame.toggleAttribute('data-locked', el.locked);
  }
}

export function createPageView(options: PageViewOptions): PageView {
  const { pageSize, mode, resolveAsset } = options;
  const root = document.createElement('div');
  root.className = `fl-page fl-mode-${mode}`;
  root.style.width = `${pageSize.width}px`;
  root.style.height = `${pageSize.height}px`;

  const bgImageHost = document.createElement('div');
  bgImageHost.className = 'fl-bg';
  root.appendChild(bgImageHost);

  const entries = new Map<string, Entry>();
  let current: Page | null = null;
  let currentAssets: Readonly<Record<string, AssetRef>> = {};

  function renderBackground(page: Page) {
    const bg = page.background;
    root.style.background = backgroundCss(bg);
    bgImageHost.replaceChildren();
    if (bg.type === 'image') {
      const src = resolveAsset(bg.assetId);
      if (src) {
        const img = document.createElement('img');
        img.className = 'fl-bg-img';
        img.alt = '';
        img.decoding = 'async';
        img.draggable = false;
        img.style.objectFit = bg.fit;
        img.src = src;
        bgImageHost.appendChild(img);
      }
    }
  }

  function buildContent(el: PageElement, split: boolean, asset: AssetRef | undefined): Element {
    switch (el.type) {
      case 'text':
        return buildText(el, split);
      case 'image':
        return buildImage(el, asset, resolveAsset);
      case 'shape':
        return buildShape(el);
    }
  }

  function createEntry(el: PageElement, split: boolean, asset: AssetRef | undefined): Entry {
    const frame = document.createElement('div');
    frame.className = 'fl-el';
    frame.dataset.elementId = el.id;
    const anim = document.createElement('div');
    anim.className = 'fl-anim';
    anim.appendChild(buildContent(el, split, asset));
    frame.appendChild(anim);
    applyFrame(frame, el, mode);
    return { frame, anim, element: el, assetRef: asset, split };
  }

  function update(page: Page, assets: Readonly<Record<string, AssetRef>>) {
    const pageChanged = current?.id !== page.id;
    if (pageChanged || current?.background !== page.background) renderBackground(page);
    root.dataset.pageId = page.id;

    const split = options.splitTextFor?.(page) ?? new Set<string>();
    const seen = new Set<string>();
    let prevNode: Node = bgImageHost;

    for (const el of page.elements) {
      seen.add(el.id);
      const asset = el.type === 'image' ? assets[el.assetId] : undefined;
      const wantSplit = el.type === 'text' && split.has(el.id);
      let entry = entries.get(el.id);
      if (!entry || entry.element.type !== el.type) {
        entry?.frame.remove();
        entry = createEntry(el, wantSplit, asset);
        entries.set(el.id, entry);
      } else if (entry.element !== el || entry.assetRef !== asset || entry.split !== wantSplit) {
        const contentChanged =
          !sameContent(entry.element, el) || entry.assetRef !== asset || entry.split !== wantSplit;
        applyFrame(entry.frame, el, mode);
        if (contentChanged && !patchImageInPlace(entry, el, asset)) {
          entry.anim.replaceChildren(buildContent(el, wantSplit, asset));
        }
        entry.element = el;
        entry.assetRef = asset;
        entry.split = wantSplit;
      }
      // Keep DOM order == array order (z-order) with minimal moves.
      if (prevNode.nextSibling !== entry.frame)
        root.insertBefore(entry.frame, prevNode.nextSibling);
      prevNode = entry.frame;
    }

    for (const [id, entry] of entries) {
      if (!seen.has(id)) {
        entry.frame.remove();
        entries.delete(id);
      }
    }
    current = page;
    currentAssets = assets;
  }

  return {
    root,
    update,
    refreshAssets() {
      if (!current) return;
      renderBackground(current);
      for (const entry of entries.values()) {
        if (entry.element.type === 'image') {
          entry.anim.replaceChildren(
            buildContent(entry.element, false, currentAssets[entry.element.assetId]),
          );
        }
      }
    },
    rerender(elementId) {
      const entry = entries.get(elementId);
      if (!entry) return;
      applyFrame(entry.frame, entry.element, mode);
      entry.anim.replaceChildren(buildContent(entry.element, entry.split, entry.assetRef));
    },
    getNodes: (id) => entries.get(id),
    get page() {
      return current;
    },
    destroy() {
      entries.clear();
      root.remove();
    },
  };
}

/**
 * Filter, corner-radius and flip changes only touch styles, so they are patched on the
 * existing nodes — slider scrubs then update smoothly without re-creating the <img>.
 */
function patchImageInPlace(entry: Entry, next: PageElement, asset: AssetRef | undefined): boolean {
  const prev = entry.element;
  if (prev.type !== 'image' || next.type !== 'image' || entry.assetRef !== asset) return false;
  if (
    prev.assetId !== next.assetId ||
    prev.crop !== next.crop ||
    prev.width !== next.width ||
    prev.height !== next.height ||
    prev.alt !== next.alt
  ) {
    return false;
  }
  const box = entry.anim.querySelector<HTMLElement>('.fl-image');
  const img = box?.querySelector<HTMLImageElement>('.fl-img');
  const flip = box?.querySelector<HTMLElement>('.fl-image-flip');
  if (!box || !img || !flip) return false;
  box.style.borderRadius = `${next.borderRadius}px`;
  img.style.filter = filterCss(next.filters);
  const sx = next.flipX ? -1 : 1;
  const sy = next.flipY ? -1 : 1;
  flip.style.transform = sx !== 1 || sy !== 1 ? `scale(${sx}, ${sy})` : '';
  return true;
}

/**
 * True when only frame-level fields differ (position/size/rotation/opacity/lock/hide/name),
 * so the content node can be kept. Images and shapes depend on size, so they re-render.
 */
function sameContent(a: PageElement, b: PageElement): boolean {
  if (a.type === 'text' && b.type === 'text') return a.content === b.content && a.style === b.style;
  if (a.type !== b.type) return false;
  const sizeSame = a.width === b.width && a.height === b.height;
  if (a.type === 'image' && b.type === 'image') {
    return (
      sizeSame &&
      a.assetId === b.assetId &&
      a.crop === b.crop &&
      a.filters === b.filters &&
      a.flipX === b.flipX &&
      a.flipY === b.flipY &&
      a.borderRadius === b.borderRadius &&
      a.alt === b.alt
    );
  }
  if (a.type === 'shape' && b.type === 'shape') {
    return (
      sizeSame &&
      a.shape === b.shape &&
      a.fill === b.fill &&
      a.stroke === b.stroke &&
      a.strokeWidth === b.strokeWidth &&
      a.cornerRadius === b.cornerRadius
    );
  }
  return false;
}
