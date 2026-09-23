import { toast } from 'sonner';
import { getIdleMotion } from '@/core/animation';
import { addTapReactionTo, createCharacter } from '@/core/character';
import { newId } from '@/core/ids';
import {
  addAsset,
  addCharacter,
  linkCharacter,
  setAssetAlpha,
  updateCharacter,
  updateElement,
} from '@/core/ops';
import type { Character, ImageElement } from '@/core/schema';
import { insertImages } from '../actions';
import { imageFilesFrom, importImageFiles } from '../assets/upload';
import { docStore } from '../store/doc-store';
import { getActivePage } from '../store/selectors';
import { useUiStore } from '../store/ui-store';
import { analyzeStoredAsset } from './alpha-info';

export const OPAQUE_WARNING =
  'This image has a solid background — characters look best as PNGs with a transparent background.';

/**
 * Turns an image into a character: pivot at its feet, soft shadow, gentle breathing idle and
 * a wiggle when tapped. Images uploaded before transparency was recorded are analysed first.
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
      const target = d.pages.find((p) => p.id === page.id);
      if (target && !el.interactions?.length) addTapReactionTo(target, el.id);
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
  docStore.change(
    (d) => {
      const target = d.pages.find((p) => p.id === page.id);
      if (target) addTapReactionTo(target, elementId, presetId);
    },
    { label: 'Add tap reaction' },
  );
}

export const MAX_POSES = 8;

/**
 * Adds extra pictures of a character (mouth open, eyes closed, happy…). Name a pose "talk" or
 * "blink" and the Talk and Blink moves use it automatically.
 */
export async function addPoses(characterId: string, files: readonly File[]): Promise<void> {
  const character = docStore.project()?.characters[characterId];
  if (!character) return;
  const images = imageFilesFrom(files).slice(0, MAX_POSES - character.poses.length);
  if (!images.length) {
    if (files.length) toast.error(`A character can have up to ${MAX_POSES} poses.`);
    return;
  }
  const { assets, errors } = await importImageFiles(images);
  errors.forEach((e) => toast.error(`${e.name}: ${e.message}`));
  if (!assets.length) return;
  docStore.change(
    (d) => {
      assets.forEach((a) => addAsset(d, a));
      updateCharacter(d, characterId, (c) => {
        for (const a of assets) {
          if (c.poses.length >= MAX_POSES) break;
          const name =
            a.name?.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || `Pose ${c.poses.length + 1}`;
          c.poses.push({ id: newId('po'), name, assetId: a.id });
        }
      });
    },
    { label: assets.length > 1 ? 'Add poses' : 'Add pose' },
  );
}

export function renamePose(characterId: string, poseId: string, name: string): void {
  const clean = name.trim().slice(0, 40);
  if (!clean) return;
  editCharacter(
    characterId,
    (c) => {
      const pose = c.poses.find((p) => p.id === poseId);
      if (pose) pose.name = clean;
    },
    { label: 'Rename pose' },
  );
}

export function removePose(characterId: string, poseId: string): void {
  editCharacter(characterId, (c) => void (c.poses = c.poses.filter((p) => p.id !== poseId)), {
    label: 'Remove pose',
  });
}
