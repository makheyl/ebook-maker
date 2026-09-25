import type { Draft } from 'immer';
import { flattenElements, walkElements } from '../schema/tree';
import type { PageElement, Project, StoryAction } from '../schema/types';

/**
 * Removes references that no longer point anywhere: animation steps of deleted elements,
 * actions that jump to deleted pages or play deleted steps, page "next" overrides to deleted
 * pages, character links to deleted characters, bubble tails and speakers that are gone,
 * sounds that were removed, and voice recordings in languages the book no longer has. Only writes when something changes, so
 * Immer keeps untouched pages structurally shared.
 */
export function cleanReferences(draft: Draft<Project>): void {
  const pageIds = new Set(draft.pages.map((p) => p.id));
  const languages = cleanLanguages(draft);
  /** Keeps a voice line's recordings in declared languages only; true if anything is left. */
  const keepDeclared = (line: Record<string, unknown>): boolean => {
    for (const code of Object.keys(line)) if (!languages.has(code)) delete line[code];
    return Object.keys(line).length > 0;
  };
  for (const page of draft.pages) {
    const all = flattenElements(page.elements as PageElement[]);
    const elementIds = new Set(all.map((e) => e.id));
    if (page.animations.some((a) => !elementIds.has(a.elementId))) {
      page.animations = page.animations.filter((a) => elementIds.has(a.elementId));
    }
    const stepIds = new Set(page.animations.map((a) => a.id));
    const valid = (a: StoryAction) =>
      a.type === 'goToPage'
        ? pageIds.has(a.pageId)
        : a.type === 'playStep'
          ? stepIds.has(a.stepId)
          : a.type === 'playSound'
            ? !!draft.sounds[a.soundId]
            : true;

    walkElements(page.elements as PageElement[], (el) => {
      if (el.interactions?.some((i) => i.actions.some((a) => !valid(a)))) {
        el.interactions = el.interactions
          .map((i) => ({ ...i, actions: i.actions.filter(valid) }))
          .filter((i) => i.actions.length > 0);
      }
      if (el.type === 'image' && el.characterId && !draft.characters[el.characterId]) {
        delete el.characterId;
      }
      if (el.type === 'bubble' && el.voice && !keepDeclared(el.voice)) delete el.voice;
      for (const interaction of el.interactions ?? []) {
        for (const action of interaction.actions) {
          // An emptied tap line stays (the checks flag it); only undeclared languages go.
          if (action.type === 'playVoice') keepDeclared(action.line);
        }
      }
      if (el.type === 'bubble') {
        // A tail whose speaker is gone stays where it pointed last (set by the op that removed
        // it, when it knew); a speaker that no longer exists is forgotten.
        if (el.tail.targetId && !elementIds.has(el.tail.targetId)) delete el.tail.targetId;
        if (el.speakerId && !draft.characters[el.speakerId]) delete el.speakerId;
      }
    });
    if (page.voiceover && !keepDeclared(page.voiceover)) delete page.voiceover;
    if (page.openSound && !draft.sounds[page.openSound]) delete page.openSound;
    const next = page.flow?.next;
    if (page.flow && next && next !== 'end' && !pageIds.has(next)) delete page.flow.next;
  }
  const turn = draft.reader.pageTurnSound;
  if (turn && !draft.sounds[turn]) delete draft.reader.pageTurnSound;
}

/**
 * One entry per language code (the first wins), and a default language that exists. Returns
 * the declared codes.
 */
function cleanLanguages(draft: Draft<Project>): Set<string> {
  const vo = draft.voiceover;
  const seen = new Set<string>();
  if (vo.languages.some((l) => seen.has(l.code) || !seen.add(l.code))) {
    const unique = new Set<string>();
    vo.languages = vo.languages.filter((l) => !unique.has(l.code) && !!unique.add(l.code));
  }
  const codes = new Set(vo.languages.map((l) => l.code));
  if (vo.defaultLanguage && !codes.has(vo.defaultLanguage)) {
    if (vo.languages[0]) vo.defaultLanguage = vo.languages[0].code;
    else delete vo.defaultLanguage;
  } else if (!vo.defaultLanguage && vo.languages[0]) {
    vo.defaultLanguage = vo.languages[0].code;
  }
  return codes;
}
