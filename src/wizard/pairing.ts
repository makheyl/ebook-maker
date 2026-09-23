import type { AssetRef } from '@/core/schema';

export type WizardImage = { asset: AssetRef; name: string };
export type WizardRow = { id: string; text: string; image: WizardImage | null };

let seq = 0;
export const rowId = () => `row-${++seq}`;

/** Non-empty lines of pasted text, trimmed. */
export function splitLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Pairs images and text lines by order into page rows. Extra images get empty text and
 * extra lines get no image, so nothing the user added is dropped.
 */
export function pairByOrder(images: readonly WizardImage[], lines: readonly string[]): WizardRow[] {
  const count = Math.max(images.length, lines.length);
  return Array.from({ length: count }, (_, i) => ({
    id: rowId(),
    text: lines[i] ?? '',
    image: images[i] ?? null,
  }));
}

/**
 * Merges newly added images/lines into existing rows: fills rows that are missing an image
 * (or text) first, in order, then appends new rows.
 */
export function mergeIntoRows(
  rows: readonly WizardRow[],
  images: readonly WizardImage[],
  lines: readonly string[],
): WizardRow[] {
  const next = rows.map((r) => ({ ...r }));
  const imgQueue = [...images];
  const lineQueue = [...lines];
  for (const row of next) {
    if (!row.image && imgQueue.length) row.image = imgQueue.shift()!;
    if (!row.text && lineQueue.length) row.text = lineQueue.shift()!;
  }
  return [...next, ...pairByOrder(imgQueue, lineQueue)];
}

/** Swaps the images of two rows (re-pairing without retyping text). */
export function swapImages(rows: readonly WizardRow[], a: number, b: number): WizardRow[] {
  if (a < 0 || b < 0 || a >= rows.length || b >= rows.length) return [...rows];
  const next = rows.map((r) => ({ ...r }));
  const tmp = next[a]!.image;
  next[a]!.image = next[b]!.image;
  next[b]!.image = tmp;
  return next;
}
