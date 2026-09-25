import type { VoiceLanguage } from '../schema/types';

export type VoiceFileMatch =
  { name: string; page: number; code: string } | { name: string; problem: string };

const PAGE_WORDS = new Set(['p', 'pg', 'page']);

/**
 * Matches recordings to pages and languages by file name, for bulk upload:
 * `page-03-tl.mp3`, `p3_tl.m4a`, `03 tl.wav`, `page3-tagalog.mp3`. The page is the first
 * number (1-based in the name, 0-based in the result); the language is a code or a name.
 * Without a language in the name, the default language is used.
 */
export function matchVoiceFile(
  name: string,
  pageCount: number,
  languages: readonly VoiceLanguage[],
  defaultCode: string | undefined,
): VoiceFileMatch {
  const stem = name.replace(/\.[a-z0-9]{1,5}$/i, '').toLowerCase();
  const tokens = stem.split(/[\s._-]+/).filter(Boolean);
  let pageNumber: number | undefined;
  let code: string | undefined;
  for (const token of tokens) {
    const num = /^(?:p|pg|page)?0*(\d{1,4})$/.exec(token);
    if (num && pageNumber === undefined) {
      pageNumber = Number(num[1]);
      continue;
    }
    if (PAGE_WORDS.has(token)) continue;
    const language = languages.find(
      (l) => l.code.toLowerCase() === token || l.name.toLowerCase() === token,
    );
    if (language && !code) code = language.code;
  }
  if (pageNumber === undefined) return { name, problem: 'no page number in the name' };
  if (pageNumber < 1 || pageNumber > pageCount) {
    return { name, problem: `there's no page ${pageNumber}` };
  }
  const lang = code ?? defaultCode;
  if (!lang) return { name, problem: 'add a language first' };
  return { name, page: pageNumber - 1, code: lang };
}

export function matchVoiceFiles(
  names: readonly string[],
  pageCount: number,
  languages: readonly VoiceLanguage[],
  defaultCode: string | undefined,
): VoiceFileMatch[] {
  const matches = names.map((n) => matchVoiceFile(n, pageCount, languages, defaultCode));
  // Two files for the same page and language: the later one would silently win; flag it.
  const seen = new Map<string, string>();
  return matches.map((m) => {
    if (!('page' in m)) return m;
    const key = `${m.page}|${m.code}`;
    const first = seen.get(key);
    if (first) return { name: m.name, problem: `same page and language as ${first}` };
    seen.set(key, m.name);
    return m;
  });
}
