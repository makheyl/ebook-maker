import { checkVoiceFile } from '@/core/sound/validate';
import type { VoiceClip } from '@/core/schema';
import { assetRepo } from '@/storage';
import { assetUrls } from './asset-urls';
import { hashAudio, pickSoundFiles, readDuration } from './upload-sound';

export type VoiceUpload = { file: File; clip: VoiceClip };

/**
 * Checks and stores voiceover recordings (deduplicated by content hash, no transcoding) in the
 * same blob store as images and sounds. Returns clips ready to put in voice lines.
 */
export async function importVoiceFiles(files: readonly File[]): Promise<{
  clips: VoiceUpload[];
  errors: { name: string; message: string }[];
}> {
  const clips: VoiceUpload[] = [];
  const errors: { name: string; message: string }[] = [];
  for (const file of files) {
    const check = checkVoiceFile(file);
    if (!check.ok) {
      errors.push({ name: file.name, message: check.message });
      continue;
    }
    try {
      const buffer = await file.arrayBuffer();
      const id = await hashAudio(buffer, 'vo');
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
      clips.push({
        file,
        clip: {
          id,
          kind: 'voice',
          mime: check.mime,
          bytes: blob.size,
          name: file.name.slice(0, 200),
          ...(duration !== undefined ? { duration } : {}),
        },
      });
    } catch (err) {
      errors.push({ name: file.name, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return { clips, errors };
}

/** Opens the file picker for recordings (must be called from a click or key press). */
export const pickVoiceFiles = (multiple = false) => pickSoundFiles(multiple, 'voice-input');
