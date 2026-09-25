import { checkMusicFile } from '@/core/sound/validate';
import type { MusicTrack } from '@/core/schema';
import { assetRepo } from '@/storage';
import { assetUrls } from './asset-urls';
import { hashAudio, pickSoundFiles, readDuration } from './upload-sound';

/** Checks and stores music files (content-hashed, no transcoding) in the shared blob store. */
export async function importMusicFiles(files: readonly File[]): Promise<{
  tracks: MusicTrack[];
  errors: { name: string; message: string }[];
}> {
  const tracks: MusicTrack[] = [];
  const errors: { name: string; message: string }[] = [];
  for (const file of files) {
    const check = checkMusicFile(file);
    if (!check.ok) {
      errors.push({ name: file.name, message: check.message });
      continue;
    }
    try {
      const buffer = await file.arrayBuffer();
      const id = await hashAudio(buffer, 'mu');
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
      tracks.push({
        id,
        kind: 'music',
        mime: check.mime,
        bytes: blob.size,
        name: file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 200) || 'Music',
        ...(duration !== undefined ? { duration } : {}),
      });
    } catch (err) {
      errors.push({ name: file.name, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return { tracks, errors };
}

export const pickMusicFiles = (multiple = true) => pickSoundFiles(multiple, 'music-input');
