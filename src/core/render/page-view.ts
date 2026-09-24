import { pivotToLocal, visibleWidthLocal } from '../character/pivot';
import { accessibleName } from '../interaction/names';
import type { TextSplit } from '../text/split';
import type { AssetRef, Character, Page, PageElement, PageSize } from '../schema/types';
import {
  buildButton,
  buildHotspot,
  buildImage,
  buildShape,
  buildText,
  STRIP_COUNT,
  type AssetResolver,
} from './nodes';
import { backgroundCss, filterCss } from './styles';

/**
 * The one renderer. Editor stage, thumbnails, in-app preview and the exported player all
 * draw pages through a PageView, which is what guarantees they look the same.
 *
 * Each element is three nested layers:
 *   .fl-el    (frame)   – position, size, rotation, opacity. The editor's transform handles target this.
 *   .fl-anim  (anim)    – the only layer the animation runtime touches (transform/opacity/clip).
 *   content             – text, image, shape, button or hotspot.
 * Keeping layout and animation transforms on separate layers means they never fight.
 *
 * Character images get two extra layers: a ground shadow beside .fl-anim, and .fl-idle inside
 * it for the idle loop, so story motions and the idle loop combine instead of overriding each
 * other. Both animation layers pivot on the character's feet.
 */

export type RenderMode = 'editor' | 'player' | 'thumbnail';

export type PageViewOptions = {
  pageSize: PageSize;
  mode: RenderMode;
  resolveAsset: AssetResolver;
  /** Texts to split into reveal units for typewriter-style animations, and how. */
  splitTextFor?: (page: Page) => ReadonlyMap<string, TextSplit>;
};

export type ElementNodes = {
  frame: HTMLElement;
  anim: HTMLElement;
  /** Idle-loop layer (character images only). */
  idle?: HTMLElement;
  /** Ground shadow (character images with a shadow only). */
  shadow?: HTMLElement;
  element: PageElement;
  character?: Character;
  /** The character's feet in element-local 0–1 coordinates (its transform origin). */
  pivot?: { x: number; y: number };
};

export type PageView = {
  readonly root: HTMLElement;
  update(
    page: Page,
    assets: Readonly<Record<string, AssetRef>>,
    characters?: Readonly<Record<string, Character>>,
  ): void;
  /** Forces image nodes to re-resolve their URLs (e.g. after assets finished loading). */
  refreshAssets(): void;
  /** Rebuilds one element's content from data (e.g. to discard DOM edits after inline editing). */
  rerender(elementId: string): void;
  getNodes(elementId: string): ElementNodes | undefined;
  readonly page: Page | null;
  readonly assets: Readonly<Record<string, AssetRef>>;
  readonly characters: Readonly<Record<string, Character>>;
  destroy(): void;
};

type Entry = ElementNodes & { assetRef: AssetRef | undefined; split: TextSplit | false };

const NO_CHARACTERS: Readonly<Record<string, Character>> = {};
const NO_SPLIT: ReadonlyMap<string, TextSplit> = new Map();

/** Buttons and elements with tap interactions are interactive in the reader. */
export function isInteractive(el: PageElement): boolean {
  return el.type === 'button' || el.type === 'hotspot' || !!el.interactions?.length;
}

function applyInteractivity(frame: HTMLElement, el: PageElement, mode: RenderMode) {
  const interactive = mode === 'player' && isInteractive(el) && !el.hidden;
  frame.toggleAttribute('data-interactive', interactive);
  // Buttons carry their own focusable <button>; anything else becomes a button itself.
  if (interactive && el.type !== 'button') {
    frame.setAttribute('role', 'button');
    frame.tabIndex = 0;
    frame.setAttribute('aria-label', accessibleName(el) || el.name);
  } else {
    frame.removeAttribute('role');
    frame.removeAttribute('tabindex');
    frame.removeAttribute('aria-label');
  }
}

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
  applyInteractivity(frame, el, mode);
}

/** Positions the pivot and ground shadow of a character instance. */
function applyCharacter(entry: Entry, asset: AssetRef | undefined) {
  const { element: el, character } = entry;
  if (!character || el.type !== 'image' || !asset) return;
  const pivot = pivotToLocal(asset, el, character.pivot);
  entry.pivot = pivot;
  const origin = `${pivot.x * 100}% ${pivot.y * 100}%`;
  entry.anim.style.transformOrigin = origin;
  if (entry.idle) entry.idle.style.transformOrigin = origin;
  entry.frame.dataset.characterId = character.id;
  // A tappable character is announced by its name unless it has its own label.
  if (entry.frame.hasAttribute('data-interactive')) {
    entry.frame.setAttribute('aria-label', accessibleName(el, character.name) || el.name);
  }
  if (entry.shadow) {
    const width = visibleWidthLocal(asset, el) * el.width * 0.8 * character.shadow.size;
    const height = Math.max(4, width * 0.16);
    const s = entry.shadow.style;
    s.width = `${width}px`;
    s.height = `${height}px`;
    s.left = `${pivot.x * el.width - width / 2}px`;
    s.top = `${pivot.y * el.height - height / 2}px`;
    s.opacity = String(character.shadow.opacity);
  }
}

export function createPageView(options: PageViewOptions): PageView {
  const { pageSize, mode, resolveAsset } = options;
  const root = document.createElement('div');
  root.className = `fl-page fl-mode-${mode}`;
  // A page is never scrollable (browsers without `overflow: clip` could still be scrolled by
  // code or a caret); snap back so what's shown always matches the page's real layout.
  root.addEventListener('scroll', () => {
    if (root.scrollTop || root.scrollLeft) root.scrollTo(0, 0);
  });
  root.style.width = `${pageSize.width}px`;
  root.style.height = `${pageSize.height}px`;

  const bgImageHost = document.createElement('div');
  bgImageHost.className = 'fl-bg';
  root.appendChild(bgImageHost);

  const entries = new Map<string, Entry>();
  let current: Page | null = null;
  let currentAssets: Readonly<Record<string, AssetRef>> = {};
  let currentCharacters: Readonly<Record<string, Character>> = NO_CHARACTERS;

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

  function buildContent(
    el: PageElement,
    split: TextSplit | false,
    asset: AssetRef | undefined,
    character?: Character,
  ): Element {
    switch (el.type) {
      case 'text':
        return buildText(el, split);
      case 'image':
        return buildImage(el, asset, resolveAsset, {
          strips: character?.warp ? STRIP_COUNT : 0,
          poses: character?.poses.map((p) => ({ id: p.id, src: resolveAsset(p.assetId) })),
        });
      case 'shape':
        return buildShape(el);
      case 'button':
        return buildButton(el, mode === 'player');
      case 'hotspot':
        return buildHotspot(el, mode === 'editor');
    }
  }

  /** Where an element's content lives (inside the idle layer for characters). */
  const contentHost = (entry: Entry) => entry.idle ?? entry.anim;

  function createEntry(
    el: PageElement,
    split: TextSplit | false,
    asset: AssetRef | undefined,
    character: Character | undefined,
  ): Entry {
    const frame = document.createElement('div');
    frame.className = 'fl-el';
    frame.dataset.elementId = el.id;
    const anim = document.createElement('div');
    anim.className = 'fl-anim';
    let idle: HTMLElement | undefined;
    let shadow: HTMLElement | undefined;
    if (character) {
      if (character.shadow.enabled) {
        shadow = document.createElement('div');
        shadow.className = 'fl-shadow';
        shadow.setAttribute('aria-hidden', 'true');
        frame.appendChild(shadow);
      }
      idle = document.createElement('div');
      idle.className = 'fl-idle';
      anim.appendChild(idle);
    }
    (idle ?? anim).appendChild(buildContent(el, split, asset, character));
    frame.appendChild(anim);
    applyFrame(frame, el, mode);
    const entry: Entry = {
      frame,
      anim,
      idle,
      shadow,
      element: el,
      character,
      assetRef: asset,
      split,
    };
    applyCharacter(entry, asset);
    return entry;
  }

  function update(
    page: Page,
    assets: Readonly<Record<string, AssetRef>>,
    characters: Readonly<Record<string, Character>> = NO_CHARACTERS,
  ) {
    const pageChanged = current?.id !== page.id;
    if (pageChanged || current?.background !== page.background) renderBackground(page);
    root.dataset.pageId = page.id;

    const split = options.splitTextFor?.(page) ?? NO_SPLIT;
    const seen = new Set<string>();
    let prevNode: Node = bgImageHost;

    for (const el of page.elements) {
      seen.add(el.id);
      const asset = el.type === 'image' ? assets[el.assetId] : undefined;
      const character =
        el.type === 'image' && el.characterId ? characters[el.characterId] : undefined;
      const wantSplit = (el.type === 'text' && split.get(el.id)) || false;
      let entry = entries.get(el.id);
      if (!entry || entry.element.type !== el.type || entry.character !== character) {
        // A character change alters the layer structure, so the element is rebuilt.
        entry?.frame.remove();
        entry = createEntry(el, wantSplit, asset, character);
        entries.set(el.id, entry);
      } else if (entry.element !== el || entry.assetRef !== asset || entry.split !== wantSplit) {
        const contentChanged =
          !sameContent(entry.element, el) || entry.assetRef !== asset || entry.split !== wantSplit;
        applyFrame(entry.frame, el, mode);
        if (contentChanged && !patchImageInPlace(entry, el, asset)) {
          contentHost(entry).replaceChildren(buildContent(el, wantSplit, asset, entry.character));
        }
        entry.element = el;
        entry.assetRef = asset;
        entry.split = wantSplit;
        applyCharacter(entry, asset);
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
    currentCharacters = characters;
  }

  return {
    root,
    update,
    refreshAssets() {
      if (!current) return;
      renderBackground(current);
      for (const entry of entries.values()) {
        if (entry.element.type === 'image') {
          const asset = currentAssets[entry.element.assetId];
          contentHost(entry).replaceChildren(
            buildContent(entry.element, false, asset, entry.character),
          );
          applyCharacter(entry, asset);
        }
      }
    },
    rerender(elementId) {
      const entry = entries.get(elementId);
      if (!entry) return;
      applyFrame(entry.frame, entry.element, mode);
      contentHost(entry).replaceChildren(
        buildContent(entry.element, entry.split, entry.assetRef, entry.character),
      );
    },
    getNodes: (id) => entries.get(id),
    get page() {
      return current;
    },
    get assets() {
      return currentAssets;
    },
    get characters() {
      return currentCharacters;
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
  const imgs = box?.querySelectorAll<HTMLImageElement>('.fl-img, .fl-pose');
  const flip = box?.querySelector<HTMLElement>('.fl-image-flip');
  if (!box || !imgs?.length || !flip) return false;
  box.style.borderRadius = `${next.borderRadius}px`;
  const filter = filterCss(next.filters);
  imgs.forEach((img) => (img.style.filter = filter));
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
  if (a.type === 'button' && b.type === 'button') {
    return (
      a.label === b.label &&
      a.icon === b.icon &&
      a.iconPosition === b.iconPosition &&
      a.style === b.style &&
      a.a11yLabel === b.a11yLabel &&
      a.name === b.name
    );
  }
  if (a.type === 'hotspot' && b.type === 'hotspot') {
    return a.name === b.name && a.a11yLabel === b.a11yLabel;
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
