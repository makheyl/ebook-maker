import { findElement, walkElements } from '../schema/tree';
import type { Page, PageElement, Project, VoiceClip, VoiceLine } from '../schema/types';

/** Where a voice line lives. */
export type VoiceTarget =
  | { kind: 'page'; pageId: string }
  | { kind: 'bubble'; pageId: string; elementId: string }
  | { kind: 'tap'; pageId: string; elementId: string; interactionId: string; index: number }
  | { kind: 'clip'; pageId: string; clipId: string; elementId?: string };

export type VoiceLineRef = { target: VoiceTarget; line: VoiceLine };

/** Every voice line on a page: the page's own, bubbles' (in groups and hidden too), taps'. */
export function pageVoiceLines(page: Page): VoiceLineRef[] {
  const out: VoiceLineRef[] = [];
  if (page.voiceover) out.push({ target: { kind: 'page', pageId: page.id }, line: page.voiceover });
  walkElements(page.elements, (el: PageElement) => {
    if (el.type === 'bubble' && el.voice) {
      out.push({ target: { kind: 'bubble', pageId: page.id, elementId: el.id }, line: el.voice });
    }
    for (const interaction of el.interactions ?? []) {
      interaction.actions.forEach((action, index) => {
        if (action.type !== 'playVoice') return;
        out.push({
          target: {
            kind: 'tap',
            pageId: page.id,
            elementId: el.id,
            interactionId: interaction.id,
            index,
          },
          line: action.line,
        });
      });
    }
  });
  for (const clip of page.audio ?? []) {
    if (clip.source.kind !== 'voice') continue;
    out.push({
      target: {
        kind: 'clip',
        pageId: page.id,
        clipId: clip.id,
        ...(clip.elementId ? { elementId: clip.elementId } : {}),
      },
      line: clip.source.line,
    });
  }
  return out;
}

/** Every voice line in the book. */
export function voiceLines(project: Pick<Project, 'pages'>): VoiceLineRef[] {
  return project.pages.flatMap(pageVoiceLines);
}

/** Every recording in the book, once each (the same file can be used by several lines). */
export function voiceClips(project: Pick<Project, 'pages'>): VoiceClip[] {
  const byId = new Map<string, VoiceClip>();
  for (const { line } of voiceLines(project)) {
    for (const clip of Object.values(line)) byId.set(clip.id, clip);
  }
  return [...byId.values()];
}

export const bookHasVoice = (project: Pick<Project, 'pages'>) => voiceClips(project).length > 0;

/** The element a voice line belongs to (none for the page's own lines). */
export function lineElementId(target: VoiceTarget): string | undefined {
  return target.kind === 'page' ? undefined : target.elementId;
}

/** A short name for a line: its element's name, or "Page sound" for a page's timed line. */
export function lineName(page: Pick<Page, 'elements'>, target: VoiceTarget): string {
  const id = lineElementId(target);
  if (!id) return target.kind === 'page' ? 'Page' : 'Page sound';
  return findElement(page.elements, id)?.name ?? 'Item';
}

/** When a line is heard, in words. */
export const LINE_WHEN: Record<VoiceTarget['kind'], string> = {
  page: 'page opens',
  bubble: 'bubble appears',
  tap: 'when tapped',
  clip: 'on the timeline',
};
