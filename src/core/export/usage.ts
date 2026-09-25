import { flattenElements } from '../schema/tree';
import { getFont, type FontSubset } from '../fonts/catalog';
import { projectAssetIds } from '../schema/asset-ids';
import type { Project } from '../schema/types';
import { voiceClips } from '../voice/lines';

/** Image files the book owns (hidden elements, characters and poses included). */
export function bookImageIds(project: Project): string[] {
  return projectAssetIds(project).filter((id) => project.assets[id]);
}

/** Every sound in the book's list, played or not. */
export function bookSoundIds(project: Project): string[] {
  return Object.keys(project.sounds);
}

/** Every voice recording the book uses. */
export function bookVoiceIds(project: Project): string[] {
  return voiceClips(project).map((c) => c.id);
}

/**
 * The files an export carries: everything the book owns, not only what a reader sees on the
 * first read, so every export is a complete backup that imports back as an editable book.
 * (Files no page or character refers to any more are still left out.)
 */
export function exportedAssetIds(project: Project): string[] {
  return [...bookImageIds(project), ...bookSoundIds(project), ...bookVoiceIds(project)];
}

export type FontUsage = { fontId: string; style: 'normal' | 'italic'; subset: FontSubset };

/** Characters beyond Latin-1 that live in the latin-ext subset. */
function needsLatinExt(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (
      (cp >= 0x100 && cp <= 0x2ff) ||
      (cp >= 0x1d00 && cp <= 0x1eff) ||
      (cp >= 0x2c60 && cp <= 0x2c7f) ||
      (cp >= 0xa720 && cp <= 0xa7ff) ||
      (cp >= 0x20a0 && cp <= 0x20c0 && cp !== 0x20ac)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * The font faces the book needs: each used family, italic only where used, and the
 * latin-ext subset only when the text contains such characters. Keeps exports small.
 */
export function usedFontFaces(project: Project): FontUsage[] {
  const faces = new Map<string, FontUsage>();
  const add = (fontId: string, style: 'normal' | 'italic', subset: FontSubset) => {
    const font = getFont(fontId);
    const s = style === 'italic' && !font.hasItalic ? 'normal' : style;
    faces.set(`${font.id}|${s}|${subset}`, { fontId: font.id, style: s, subset });
  };
  for (const page of project.pages) {
    for (const el of flattenElements(page.elements)) {
      if (el.type === 'button' && !el.hidden && el.iconPosition !== 'only') {
        add(el.style.fontFamily, 'normal', 'latin');
        if (needsLatinExt(el.label)) add(el.style.fontFamily, 'normal', 'latin-ext');
        continue;
      }
      if ((el.type !== 'text' && el.type !== 'bubble') || el.hidden) continue;
      const text = el.content.map((p) => p.runs.map((r) => r.text).join('')).join('\n');
      const ext = needsLatinExt(text);
      const styles = new Set<'normal' | 'italic'>();
      styles.add(el.style.italic ? 'italic' : 'normal');
      for (const p of el.content) {
        for (const r of p.runs) styles.add(r.italic || el.style.italic ? 'italic' : 'normal');
      }
      for (const style of styles) {
        add(el.style.fontFamily, style, 'latin');
        if (ext) add(el.style.fontFamily, style, 'latin-ext');
      }
    }
  }
  return [...faces.values()];
}
