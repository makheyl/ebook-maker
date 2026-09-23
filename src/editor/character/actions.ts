import { toast } from 'sonner';
import { createAnimationStep, getIdleMotion } from '@/core/animation';
import { createCharacter } from '@/core/character';
import {
  addAnimation,
  addCharacter,
  linkCharacter,
  setAssetAlpha,
  updateCharacter,
  updateElement,
} from '@/core/ops';
import type { Character, ImageElement } from '@/core/schema';
import { insertImages } from '../actions';
import { docStore } from '../store/doc-store';
import { getActivePage } from '../store/selectors';
import { useUiStore } from '../store/ui-store';
import { analyzeStoredAsset } from './alpha-info';

export const OPAQUE_WARNING =
  'This image has a solid background — characters look best as PNGs with a transparent background.';

/**
 * Turns an image into a character: pivot at its feet, soft shadow, gentle breathing idle.
 * Images uploaded before transparency was recorded are analysed first.
 */
export async function makeCharacter(elementId: string): Promise<string | undefined> {
  const project = docStore.project();
  const page = getActivePage();
  const el = page?.elements.find(
    (e): e is ImageElement => e.id === elementId && e.type === 'image',
  );
  if (!project || !page || !el) return;
  const asset = project.assets[el.assetId];
  if (!asset) return;
  const info =
    asset.hasAlpha === undefined
      ? await analyzeStoredAsset(asset.id).catch(() => ({ hasAlpha: false }))
      : { hasAlpha: asset.hasAlpha, opaqueBounds: asset.opaqueBounds };
  // Reuse the book's existing character for the same artwork.
  const existing = Object.values(project.characters).find((c) => c.assetId === asset.id);
  const character = existing ?? createCharacter({ ...asset, ...info }, el.name);
  docStore.change(
    (d) => {
      if (asset.hasAlpha === undefined) setAssetAlpha(d, asset.id, info);
      if (!existing) addCharacter(d, character);
      linkCharacter(d, page.id, el.id, character.id);
    },
    { label: 'Make character' },
  );
  if (!info.hasAlpha) toast.warning(OPAQUE_WARNING, { duration: 8000 });
  return character.id;
}

/** Uploads a character image, places it on the page and turns it into a character. */
export async function insertCharacter(files: readonly File[]): Promise<void> {
  const before = new Set(getActivePage()?.elements.map((e) => e.id));
  await insertImages(files.slice(0, 1));
  const added = getActivePage()?.elements.find((e) => !before.has(e.id) && e.type === 'image');
  if (added) {
    await makeCharacter(added.id);
    useUiStore.getState().select([added.id]);
  }
}

export function unlinkCharacter(elementId: string): void {
  const page = getActivePage();
  if (!page) return;
  docStore.change((d) => linkCharacter(d, page.id, elementId, undefined), {
    label: 'Stop being a character',
  });
}

export function editCharacter(
  characterId: string,
  recipe: (c: Character) => void,
  opts: { label?: string; coalesceKey?: string } = {},
): void {
  docStore.change((d) => updateCharacter(d, characterId, recipe), {
    label: opts.label ?? 'Character',
    coalesceKey: opts.coalesceKey,
  });
}

/** Sets the idle loop; bending idles turn on the character's strip rendering. */
export function setCharacterIdle(characterId: string, preset: string | null): void {
  editCharacter(
    characterId,
    (c) => {
      c.idle = preset ? { preset, intensity: c.idle?.intensity ?? 1 } : null;
      if (preset && getIdleMotion(preset)?.warp) c.warp = true;
    },
    { label: 'Idle motion' },
  );
}

/** Per-page idle for one instance ('none' switches it off; undefined follows the character). */
export function setInstanceIdle(elementId: string, preset: string | undefined): void {
  const page = getActivePage();
  if (!page) return;
  docStore.change(
    (d) =>
      updateElement(d, page.id, elementId, (el) => {
        if (el.type !== 'image') return;
        if (preset) el.idleOverride = preset;
        else delete el.idleOverride;
      }),
    { label: 'Idle motion on this page' },
  );
}

/** Adds a tap reaction to a character: tapping it plays a wiggle. */
export function addTapReaction(elementId: string, presetId = 'wiggle'): void {
  const page = getActivePage();
  if (!page) return;
  const step = { ...createAnimationStep(elementId, presetId, 'onInteraction') };
  docStore.change(
    (d) => {
      addAnimation(d, page.id, step);
      updateElement(d, page.id, elementId, (el) => {
        el.interactions = [
          ...(el.interactions ?? []),
          {
            id: `ia_${step.id}`,
            trigger: 'tap',
            once: false,
            actions: [{ type: 'playStep', stepId: step.id }],
          },
        ];
      });
    },
    { label: 'Add tap reaction' },
  );
}
