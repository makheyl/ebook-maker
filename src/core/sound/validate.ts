import { MAX_SOUND_BYTES, MAX_VOICE_BYTES, SOUND_MIMES } from '../schema/project';
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

/** Warn when a book's voice recordings add up to more than this. */
export const VOICE_TOTAL_WARNING_BYTES = 80 * 1024 * 1024;

/** Like checkSoundFile, for voiceover recordings (up to 10 MB). */
export function checkVoiceFile(file: {
  name: string;
  type: string;
  size: number;
}): { ok: true; mime: SoundMime } | { ok: false; message: string } {
  // (File's name and type are getters, so they're copied by hand.)
  const asSound = checkSoundFile({
    name: file.name,
    type: file.type,
    size: Math.min(file.size, 1),
  });
  if (!asSound.ok) {
    return { ok: false, message: 'Use an MP3, M4A, OGG or WAV recording.' };
  }
  if (file.size > MAX_VOICE_BYTES) {
    return {
      ok: false,
      message: 'Recordings can be up to 10 MB — try a shorter clip, or save it as MP3/M4A.',
    };
  }
  if (file.size === 0) return { ok: false, message: 'This file is empty.' };
  return asSound;
}
