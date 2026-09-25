import { walkElements } from '../schema/tree';
import type { Page, PageElement, Project, VoiceClip, VoiceLine } from '../schema/types';

/** Where a voice line lives. */
export type VoiceTarget =
  | { kind: 'page'; pageId: string }
  | { kind: 'bubble'; pageId: string; elementId: string }
  | { kind: 'tap'; pageId: string; elementId: string; interactionId: string; index: number };

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
