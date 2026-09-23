/**
 * Picks a font size that should fit `text` in a box, using an average glyph width estimate.
 * Templates only need a good starting point — the editor re-measures real text when edited.
 */
export function fitFontSize(
  text: string,
  box: { width: number; height: number },
  opts: { min: number; max: number; lineHeight: number; charWidth?: number },
): number {
  const charWidth = opts.charWidth ?? 0.52;
  const words = text.trim().split(/\s+/).filter(Boolean);
  for (let size = opts.max; size > opts.min; size -= 2) {
    const perLine = Math.max(1, Math.floor(box.width / (size * charWidth)));
    let lines = 1;
    let used = 0;
    for (const word of words) {
      const len = word.length;
      if (used === 0) used = len;
      else if (used + 1 + len <= perLine) used += 1 + len;
      else {
        lines += Math.ceil(len / perLine);
        used = len % perLine || perLine;
      }
    }
    lines += text.split('\n').length - 1;
    if (lines * size * opts.lineHeight <= box.height) return size;
  }
  return opts.min;
}
