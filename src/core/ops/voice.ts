import type { Draft } from 'immer';
import { findElement } from '../schema/tree';
import { newId } from '../ids';
import type { PageElement, Project, VoiceClip, VoiceLanguage } from '../schema/types';
import { MAX_VOICE_LANGUAGES } from '../schema/project';
import type { VoiceTarget } from '../voice/lines';
import { getPage } from './pages';
import { cleanReferences } from './references';

type DraftLine = Record<string, VoiceClip>;

/** Adds a language (the first one becomes the default). Returns false when it can't. */
export function addLanguage(draft: Draft<Project>, language: VoiceLanguage): boolean {
  const vo = draft.voiceover;
  if (vo.languages.length >= MAX_VOICE_LANGUAGES) return false;
  if (vo.languages.some((l) => l.code === language.code)) return false;
  vo.languages.push({ code: language.code, name: language.name.trim().slice(0, 40) });
  if (!vo.defaultLanguage) vo.defaultLanguage = language.code;
  return true;
}

export function renameLanguage(draft: Draft<Project>, code: string, name: string): void {
  const language = draft.voiceover.languages.find((l) => l.code === code);
  const trimmed = name.trim().slice(0, 40);
  if (language && trimmed) language.name = trimmed;
}

/** Removes a language and every recording in it (cleanReferences drops the clips). */
export function removeLanguage(draft: Draft<Project>, code: string): void {
  draft.voiceover.languages = draft.voiceover.languages.filter((l) => l.code !== code);
  cleanReferences(draft);
}

export function setDefaultLanguage(draft: Draft<Project>, code: string): void {
  if (draft.voiceover.languages.some((l) => l.code === code)) {
    draft.voiceover.defaultLanguage = code;
  }
}

/** The line at a target, created if `create` (a page's or bubble's line starts empty). */
function lineAt(draft: Draft<Project>, target: VoiceTarget, create: boolean): DraftLine | null {
  const page = getPage(draft, target.pageId);
  if (target.kind === 'page') {
    if (!page.voiceover && create) page.voiceover = {};
    return (page.voiceover as DraftLine | undefined) ?? null;
  }
  if (target.kind === 'clip') {
    const clip = page.audio?.find((c) => c.id === target.clipId);
    return clip?.source.kind === 'voice' ? (clip.source.line as DraftLine) : null;
  }
  const el = findElement(page.elements, target.elementId);
  if (!el) return null;
  if (target.kind === 'bubble') {
    if (el.type !== 'bubble') return null;
    if (!el.voice && create) el.voice = {};
    return (el.voice as DraftLine | undefined) ?? null;
  }
  const action = el.interactions?.find((i) => i.id === target.interactionId)?.actions[target.index];
  return action?.type === 'playVoice' ? (action.line as DraftLine) : null;
}

/** Puts a recording in a line for one language, or removes it (clip null). */
export function setVoiceClip(
  draft: Draft<Project>,
  target: VoiceTarget,
  code: string,
  clip: VoiceClip | null,
): void {
  const line = lineAt(draft, target, !!clip);
  if (!line) return;
  if (clip) line[code] = { ...clip };
  else delete line[code];
  // An emptied page or bubble line goes away (a tap's stays: the checks flag it).
  cleanReferences(draft);
}

/** The first voice line said when this element is tapped, if any. */
export function tapVoiceTarget(
  page: { id: string; elements: readonly PageElement[] },
  elementId: string,
): Extract<VoiceTarget, { kind: 'tap' }> | null {
  const el = findElement(page.elements, elementId);
  for (const interaction of el?.interactions ?? []) {
    const index = interaction.actions.findIndex((a) => a.type === 'playVoice');
    if (index >= 0) {
      return { kind: 'tap', pageId: page.id, elementId, interactionId: interaction.id, index };
    }
  }
  return null;
}

/**
 * "Speak when tapped": adds a Play voiceover action to the element's existing tap (keeping
 * its wiggle or other reactions), or a new tap when there's none. Respects the limits of 8
 * actions per tap and 4 taps per element. Returns where the line is (or null if it's full).
 */
export function addVoiceToTap(
  draft: Draft<Project>,
  pageId: string,
  elementId: string,
): Extract<VoiceTarget, { kind: 'tap' }> | null {
  const page = getPage(draft, pageId);
  const existing = tapVoiceTarget(page as { id: string; elements: PageElement[] }, elementId);
  if (existing) return existing;
  const el = findElement(page.elements, elementId);
  if (!el) return null;
  const tap = el.interactions?.find((i) => i.trigger === 'tap' && i.actions.length < 8);
  if (tap) {
    tap.actions.push({ type: 'playVoice', line: {} });
    return {
      kind: 'tap',
      pageId,
      elementId,
      interactionId: tap.id,
      index: tap.actions.length - 1,
    };
  }
  if ((el.interactions?.length ?? 0) >= 4) return null;
  const interaction = {
    id: newId('ia'),
    trigger: 'tap' as const,
    once: false,
    actions: [{ type: 'playVoice' as const, line: {} }],
  };
  el.interactions = [...(el.interactions ?? []), interaction];
  return { kind: 'tap', pageId, elementId, interactionId: interaction.id, index: 0 };
}
