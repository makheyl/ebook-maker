import { checkSoundFile } from '@/core/sound/validate';
import type { SoundRef } from '@/core/schema';
import { assetRepo } from '@/storage';
import { assetUrls } from './asset-urls';

export async function hashAudio(buffer: ArrayBuffer, prefix = 'snd'): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex.slice(0, 40)}`;
}

/** Reads the clip length (best effort: some formats or browsers won't say). */
export function readDuration(blob: Blob): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    const done = (value: number | undefined) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      audio.removeAttribute('src');
      resolve(value);
    };
    const timer = setTimeout(() => done(undefined), 3000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () =>
      done(Number.isFinite(audio.duration) ? Math.round(audio.duration * 100) / 100 : undefined);
    audio.onerror = () => done(undefined);
    audio.src = url;
  });
}

/**
 * Checks and stores sound files (deduplicated by content hash, no transcoding) in the same
 * blob store as images. Returns sound refs ready to add to the book.
 */
export async function importSoundFiles(files: readonly File[]): Promise<{
  sounds: SoundRef[];
  errors: { name: string; message: string }[];
}> {
  const sounds: SoundRef[] = [];
  const errors: { name: string; message: string }[] = [];
  for (const file of files) {
    const check = checkSoundFile(file);
    if (!check.ok) {
      errors.push({ name: file.name, message: check.message });
      continue;
    }
    try {
      const buffer = await file.arrayBuffer();
      const id = await hashAudio(buffer);
      const blob = new Blob([buffer], { type: check.mime });
      const duration = await readDuration(blob);
      await assetRepo.put({
        id,
        blob,
        thumb: blob,
        mime: check.mime,
        width: 0,
        height: 0,
        bytes: blob.size,
        createdAt: Date.now(),
      });
      assetUrls.register(id, blob, blob);
      sounds.push({
        id,
        kind: 'audio',
        mime: check.mime,
        bytes: blob.size,
        name: file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 200) || 'Sound',
        ...(duration !== undefined ? { duration } : {}),
      });
    } catch (err) {
      errors.push({ name: file.name, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return { sounds, errors };
}

export const SOUND_ACCEPT =
  'audio/mpeg,audio/ogg,audio/wav,audio/mp4,audio/x-m4a,audio/aac,.mp3,.ogg,.oga,.wav,.m4a,.aac';

/** Opens the file picker for sounds (must be called from a click or key press). */
export function pickSoundFiles(multiple = false, testId = 'sound-input'): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = SOUND_ACCEPT;
    input.multiple = multiple;
    input.dataset.testid = testId;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve([...(input.files ?? [])]);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve([]);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}
