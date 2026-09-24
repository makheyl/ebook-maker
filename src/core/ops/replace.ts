import type { Draft } from 'immer';
import { getPreset } from '../animation/presets';
import {
  createButtonElement,
  createImageElement,
  createShapeElement,
  createTextElement,
} from '../schema/factories';
import { FULL_CROP } from '../schema/defaults';
import { locate } from '../schema/tree';
import type {
  AnimationStep,
  AssetRef,
  ElementType,
  PageElement,
  Project,
  ShapeElement,
  Theme,
} from '../schema/types';
import { getPage } from './pages';
import { cleanReferences } from './references';

/** What an element can be replaced with. */
export type ReplaceSource =
  | { kind: 'image'; asset: AssetRef }
  | { kind: 'shape'; shape: ShapeElement['shape'] }
  | { kind: 'text'; text?: string }
  | { kind: 'button'; label?: string };

/** Whether an animation step still makes sense on an element of this type. */
export function stepFits(
  step: Pick<AnimationStep, 'preset'>,
  type: ElementType,
  isCharacter: boolean,
): boolean {
  const preset = getPreset(step.preset);
  if (!preset) return false;
  if (preset.appliesTo && !preset.appliesTo.includes(type)) return false;
  if (preset.requiresCharacter && !isCharacter) return false;
  if (preset.splitText === 'chars' && type !== 'text') return false;
  return true;
}

function freshElement(source: ReplaceSource, box: PageElement, theme: Theme): PageElement {
  const at = { x: box.x, y: box.y, width: box.width, height: box.height };
  switch (source.kind) {
    case 'image':
      return createImageElement(source.asset, at, {}, 'exact');
    case 'shape':
      return createShapeElement(source.shape, at, { fill: theme.accent });
    case 'text':
      return createTextElement(source.text ?? 'Your text', at, {
        style: {
          fontFamily: theme.fontFamily,
          color: theme.textColor,
          fontSize: Math.max(16, Math.round(Math.min(box.height * 0.4, 64))),
          align: 'center',
          verticalAlign: 'middle',
          autofit: 'shrink',
        },
      });
    case 'button':
      return createButtonElement(source.label ?? 'Tap me', at, {
        style: { fontFamily: theme.fontFamily, fill: theme.accent, radius: box.height / 2 },
      });
  }
}

/**
 * Replaces an element in place, like "Change picture" / "Replace" in presentation and design
 * apps: the id — and so its animations, tap actions and place in the stack — stay, as do its
 * position, size, rotation, opacity, lock, visibility and screen-reader name. Animations that
 * can't work on the new kind of element are removed and returned so the editor can say so.
 *
 * A picture replacing a picture keeps its filters, flips and corner radius, and a character
 * stays a character (the editor decides whether that should change the character itself).
 */
export function replaceElement(
  draft: Draft<Project>,
  pageId: string,
  id: string,
  source: ReplaceSource,
): { removed: AnimationStep[] } {
  const page = getPage(draft, pageId);
  const where = locate(page.elements as PageElement[], id);
  if (!where) return { removed: [] };
  const old = JSON.parse(JSON.stringify(where.list[where.index])) as PageElement;
  if (old.type === 'group') return { removed: [] };
  if (source.kind === 'image') draft.assets[source.asset.id] ??= source.asset;

  let next: PageElement;
  if (old.type === 'image' && source.kind === 'image') {
    next = {
      ...old,
      assetId: source.asset.id,
      crop: { ...FULL_CROP },
      name: source.asset.name?.replace(/\.[a-z0-9]+$/i, '').slice(0, 32) || old.name,
    };
  } else {
    const fresh = freshElement(source, old, draft.theme);
    next = {
      ...fresh,
      id: old.id,
      x: old.x,
      y: old.y,
      width: old.width,
      height: old.height,
      rotation: old.rotation,
      opacity: old.opacity,
      locked: old.locked,
      hidden: old.hidden,
      ...(old.interactions ? { interactions: old.interactions } : {}),
      ...(old.a11yLabel ? { a11yLabel: old.a11yLabel } : {}),
    } as PageElement;
  }
  where.list[where.index] = next as never;

  const isCharacter = next.type === 'image' && !!next.characterId;
  const removed = page.animations.filter(
    (s) => s.elementId === id && !stepFits(s, next.type, isCharacter),
  );
  if (removed.length) {
    const gone = new Set(removed.map((s) => s.id));
    page.animations = page.animations.filter((s) => !gone.has(s.id));
    cleanReferences(draft);
  }
  return { removed: JSON.parse(JSON.stringify(removed)) as AnimationStep[] };
}

/**
 * Resizes a picture's box to the picture's own shape (no cropping), centred on the old box and
 * fitting inside it — "Fit whole picture" after a replace.
 */
export function fitWholePicture(draft: Draft<Project>, pageId: string, id: string): void {
  const page = getPage(draft, pageId);
  const where = locate(page.elements as PageElement[], id);
  const el = where?.list[where.index] as PageElement | undefined;
  if (!el || el.type !== 'image') return;
  const asset = draft.assets[el.assetId];
  if (!asset) return;
  const scale = Math.min(el.width / asset.width, el.height / asset.height);
  const width = asset.width * scale;
  const height = asset.height * scale;
  el.x += (el.width - width) / 2;
  el.y += (el.height - height) / 2;
  el.width = width;
  el.height = height;
  el.crop = { ...FULL_CROP };
}
