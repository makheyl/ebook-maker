import { toast } from 'sonner';
import { create } from 'zustand';
import { getPreset } from '@/core/animation';
import { defaultPivot } from '@/core/character';
import { fitWholePicture, linkCharacter, replaceElement, type ReplaceSource } from '@/core/ops';
import {
  findElement,
  FULL_CROP,
  walkElements,
  type AnimationStep,
  type AssetRef,
  type ImageElement,
  type PageElement,
} from '@/core/schema';
import { imageFilesFrom, importImageFiles } from '../assets/upload';
import { docStore, useDocStore } from '../store/doc-store';
import { getActivePage } from '../store/selectors';

/** A picture waiting for "update the character, or only this picture?". */
type PendingCharacterReplace = { elementId: string; asset: AssetRef; characterName: string };

export const useReplaceStore = create<{ pending: PendingCharacterReplace | null }>(() => ({
  pending: null,
}));

function reportRemoved(removed: readonly AnimationStep[], type: string) {
  if (!removed.length) return;
  const names = [...new Set(removed.map((s) => getPreset(s.preset)?.label ?? s.preset))].join(', ');
  toast.info(`Removed animations that don’t work on a ${type}: ${names}.`, {
    duration: 7000,
    action: { label: 'Undo', onClick: () => useDocStore.getState().undo() },
  });
}

const typeName: Record<ReplaceSource['kind'], string> = {
  image: 'picture',
  shape: 'shape',
  text: 'text box',
  button: 'button',
  bubble: 'speech bubble',
};

/** Replaces one element with something else, keeping its animations where they still apply. */
export function replaceWith(elementId: string, source: ReplaceSource): void {
  const page = getActivePage();
  if (!page) return;
  let removed: AnimationStep[] = [];
  docStore.change(
    (d) => {
      removed = replaceElement(d, page.id, elementId, source).removed;
    },
    { label: 'Replace' },
  );
  reportRemoved(removed, typeName[source.kind]);
}

/**
 * Replaces a picture with an uploaded file. A character's picture asks first whether the
 * character itself changes (every page) or only this picture.
 */
export async function replacePicture(elementId: string, files: readonly File[]): Promise<void> {
  const [file] = imageFilesFrom(files);
  if (!file) return;
  const { assets, errors } = await importImageFiles([file]);
  errors.forEach((e) => toast.error(`${e.name}: ${e.message}`));
  const asset = assets[0];
  const project = docStore.project();
  const page = getActivePage();
  if (!asset || !project || !page) return;
  const el = findElement(page.elements, elementId);
  if (el?.type === 'image' && el.characterId && project.characters[el.characterId]) {
    useReplaceStore.setState({
      pending: {
        elementId,
        asset,
        characterName: project.characters[el.characterId]!.name,
      },
    });
    return;
  }
  replaceWith(elementId, { kind: 'image', asset });
}

/** Answers the character question. */
export function resolveCharacterReplace(choice: 'character' | 'only' | 'cancel'): void {
  const pending = useReplaceStore.getState().pending;
  useReplaceStore.setState({ pending: null });
  if (!pending || choice === 'cancel') return;
  const page = getActivePage();
  const project = docStore.project();
  const el = page && findElement(page.elements, pending.elementId);
  if (!page || !project || el?.type !== 'image' || !el.characterId) return;
  const characterId = el.characterId;
  const { asset } = pending;

  if (choice === 'only') {
    let removed: AnimationStep[] = [];
    docStore.change(
      (d) => {
        linkCharacter(d, page.id, el.id, undefined);
        removed = replaceElement(d, page.id, el.id, { kind: 'image', asset }).removed;
      },
      { label: 'Replace picture' },
    );
    reportRemoved(removed, 'plain picture');
    return;
  }

  const character = project.characters[characterId]!;
  docStore.change(
    (d) => {
      d.assets[asset.id] ??= asset;
      const c = d.characters[characterId]!;
      c.assetId = asset.id;
      c.pivot = defaultPivot(asset.opaqueBounds);
      for (const p of d.pages) {
        walkElements(p.elements as PageElement[], (e) => {
          if (e.type === 'image' && e.characterId === characterId) {
            (e as ImageElement).assetId = asset.id;
            (e as ImageElement).crop = { ...FULL_CROP };
          }
        });
      }
    },
    { label: `Change ${character.name}’s picture` },
  );
  if (character.poses.length) {
    toast.warning(
      `${character.name}’s poses were drawn for the old picture — replace them in the Character panel if they don’t match.`,
      { duration: 8000 },
    );
  }
}

export function fitWholePictureOf(elementId: string): void {
  const page = getActivePage();
  if (!page) return;
  docStore.change((d) => fitWholePicture(d, page.id, elementId), { label: 'Fit whole picture' });
}

/** Opens the file picker for a replacement picture (call from a click or menu choice). */
export function pickReplacementPicture(elementId: string): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  input.dataset.testid = 'replace-picture-input';
  input.addEventListener('change', () => {
    void replacePicture(elementId, [...(input.files ?? [])]);
    input.remove();
  });
  input.addEventListener('cancel', () => input.remove());
  document.body.appendChild(input);
  input.click();
}
