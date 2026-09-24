import { MAX_SOUND_BYTES, SOUND_MIMES } from '../schema/project';
import type { SoundMime } from '../schema/types';

const BY_EXTENSION: Record<string, SoundMime> = {
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
};

/** Warn when a book's sounds add up to more than this. */
export const SOUND_TOTAL_WARNING_BYTES = 30 * 1024 * 1024;

/**
 * The stored MIME type for an uploaded sound, or an error a person can act on. Browsers
 * report types inconsistently (e.g. "" or "audio/x-m4a"), so the extension is a fallback.
 */
export function checkSoundFile(file: {
  name: string;
  type: string;
  size: number;
}): { ok: true; mime: SoundMime } | { ok: false; message: string } {
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? '';
  const type = file.type.toLowerCase();
  const mime = (SOUND_MIMES as readonly string[]).includes(type)
    ? (type as SoundMime)
    : BY_EXTENSION[ext];
  if (!mime) return { ok: false, message: 'Use an MP3, OGG, WAV or M4A sound.' };
  if (file.size > MAX_SOUND_BYTES) {
    return { ok: false, message: 'Sounds can be up to 2 MB — try a shorter clip.' };
  }
  if (file.size === 0) return { ok: false, message: 'This file is empty.' };
  return { ok: true, mime };
}
