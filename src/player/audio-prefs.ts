import type { VoiceChoice } from '../core/voice/resolve';

/**
 * What a reader chose for a book's audio, remembered per book: the voiceover language (or
 * 'off'), Read to me, and background music on/off and volume. Wrapped in try/catch
 * everywhere: storage can be blocked, and the book must still work.
 */
export type AudioPrefs = {
  lang?: VoiceChoice;
  readToMe: boolean;
  music: boolean;
  musicVolume: number;
};

const key = (bookId: string) => `folio:audio:${bookId}`;
/** Where M28–M29 kept the voice choice; read once and moved over. */
const legacyKey = (bookId: string) => `folio:voice:${bookId}`;

function parse(raw: string | null): AudioPrefs | null {
  if (!raw) return null;
  const value = JSON.parse(raw) as unknown;
  if (typeof value !== 'object' || value === null) return null;
  const { lang, readToMe, music, musicVolume } = value as Record<string, unknown>;
  return {
    ...(typeof lang === 'string' && lang.length <= 20 ? { lang } : {}),
    readToMe: readToMe === true,
    music: music !== false,
    musicVolume:
      typeof musicVolume === 'number' && musicVolume >= 0 && musicVolume <= 1 ? musicVolume : 1,
  };
}

export function loadAudioPrefs(bookId: string): AudioPrefs | null {
  try {
    const current = parse(localStorage.getItem(key(bookId)));
    if (current) return current;
    const legacy = parse(localStorage.getItem(legacyKey(bookId)));
    if (legacy) {
      localStorage.setItem(key(bookId), JSON.stringify(legacy));
      localStorage.removeItem(legacyKey(bookId));
    }
    return legacy;
  } catch {
    return null;
  }
}

export function saveAudioPrefs(bookId: string, prefs: AudioPrefs): void {
  try {
    localStorage.setItem(key(bookId), JSON.stringify(prefs));
  } catch {
    // Not remembered: the book still works.
  }
}
