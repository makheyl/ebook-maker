import { plainText } from '../schema/text';
import type { TextElement } from '../schema/types';

/**
 * How a text is split for reveal animations (typewriter): per letter, per word, or in chunks of
 * words. Each unit is one animated span, so long texts use bigger units to stay light.
 */
export type TextSplit = 'chars' | 'words' | 'chunks';
export type RevealBy = 'auto' | 'letter' | 'word';

/** At most this many animated units per text. */
export const MAX_REVEAL_UNITS = 800;
/** "Automatic" reveals letter by letter up to this many characters, then word by word. */
export const AUTO_LETTER_LIMIT = 600;

const countChars = (text: string) => Array.from(text).length;
const countWords = (text: string) => (text.match(/\S+/g) ?? []).length;

export function splitModeFor(
  element: Pick<TextElement, 'content'>,
  by: RevealBy = 'auto',
): TextSplit {
  const text = plainText(element.content);
  const words = countWords(text);
  const byWords: TextSplit = words <= MAX_REVEAL_UNITS ? 'words' : 'chunks';
  if (by === 'word') return byWords;
  const chars = countChars(text);
  const letterLimit = by === 'letter' ? MAX_REVEAL_UNITS : AUTO_LETTER_LIMIT;
  return chars <= letterLimit ? 'chars' : byWords;
}

/** Words per chunk so a text has at most MAX_REVEAL_UNITS chunks. */
export function wordsPerChunk(element: Pick<TextElement, 'content'>): number {
  return Math.max(1, Math.ceil(countWords(plainText(element.content)) / MAX_REVEAL_UNITS));
}

/** Splits a run's text into reveal units (a word keeps the spaces after it). */
export function splitRun(text: string, mode: TextSplit, perChunk = 1): string[] {
  if (mode === 'chars') return Array.from(text);
  const words = text.match(/\s+|\S+\s*/g) ?? [];
  if (mode === 'words' || perChunk <= 1) return words;
  const chunks: string[] = [];
  let current = '';
  let count = 0;
  for (const w of words) {
    current += w;
    if (/\S/.test(w)) count++;
    if (count >= perChunk) {
      chunks.push(current);
      current = '';
      count = 0;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
