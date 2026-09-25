import type { VoiceChoice } from '../core/voice/resolve';

/**
 * What a reader chose for a book's audio, remembered per book: the voiceover language (or
 * 'off') and Read to me. Wrapped in try/catch everywhere: storage can be blocked, and the book
 * must still work.
 */
export type VoicePrefs = { lang?: VoiceChoice; readToMe: boolean };

const key = (bookId: string) => `folio:voice:${bookId}`;

export function loadVoicePrefs(bookId: string): VoicePrefs | null {
  try {
    const raw = localStorage.getItem(key(bookId));
    if (!raw) return null;
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== 'object' || value === null) return null;
    const { lang, readToMe } = value as { lang?: unknown; readToMe?: unknown };
    return {
      ...(typeof lang === 'string' && lang.length <= 20 ? { lang } : {}),
      readToMe: readToMe === true,
    };
  } catch {
    return null;
  }
}

export function saveVoicePrefs(bookId: string, prefs: VoicePrefs): void {
  try {
    localStorage.setItem(key(bookId), JSON.stringify(prefs));
  } catch {
    // Not remembered: the book still works.
  }
}
