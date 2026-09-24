import { toast } from 'sonner';
import { addSound, removeSound, renameSound } from '@/core/ops';
import type { SoundRef } from '@/core/schema';
import { SOUND_TOTAL_WARNING_BYTES } from '@/core/sound/validate';
import { importSoundFiles, pickSoundFiles } from '../assets/upload-sound';
import { docStore } from '../store/doc-store';

/** Uploads sounds into the book (one undo step). Returns the added sounds. */
export async function addSounds(files: readonly File[]): Promise<SoundRef[]> {
  if (!files.length) return [];
  const { sounds, errors } = await importSoundFiles(files);
  errors.forEach((e) => toast.error(`${e.name}: ${e.message}`));
  if (!sounds.length) return [];
  docStore.change((d) => sounds.forEach((s) => addSound(d, s)), {
    label: sounds.length > 1 ? 'Add sounds' : 'Add sound',
  });
  const total = Object.values(docStore.project()?.sounds ?? {}).reduce((n, s) => n + s.bytes, 0);
  if (total > SOUND_TOTAL_WARNING_BYTES) {
    toast.warning('This book has over 30 MB of sounds — it may be slow to open on phones.');
  }
  return sounds;
}

/** Asks for one sound file and adds it. Call from a click. */
export async function uploadSound(): Promise<SoundRef | undefined> {
  const [added] = await addSounds(await pickSoundFiles());
  return added;
}

export function deleteSound(soundId: string): void {
  docStore.change((d) => removeSound(d, soundId), { label: 'Remove sound' });
}

export function setSoundName(soundId: string, name: string): void {
  docStore.change((d) => renameSound(d, soundId, name), { label: 'Rename sound' });
}

export function setPageTurnSound(soundId: string | undefined): void {
  docStore.change(
    (d) => {
      if (soundId) d.reader.pageTurnSound = soundId;
      else delete d.reader.pageTurnSound;
    },
    { label: 'Page-turn sound' },
  );
}
