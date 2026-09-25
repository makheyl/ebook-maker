import type { Draft } from 'immer';
import { openSoundClipId } from '../audio/schedule';
import { newId } from '../ids';
import { DEFAULT_MIX } from '../audio/mix';
import { findElement } from '../schema/tree';
import type { AudioClip, Project, StoryAction } from '../schema/types';
import { getPage } from './pages';

type DraftClip = Draft<AudioClip>;

/** A new clip with default mix settings. */
export function createClip(
  source: AudioClip['source'],
  start: AudioClip['start'],
  elementId?: string,
): AudioClip {
  return {
    id: newId('ac'),
    ...(elementId ? { elementId } : {}),
    source,
    start,
    mix: { ...DEFAULT_MIX },
    loop: false,
  };
}

export function addClip(draft: Draft<Project>, pageId: string, clip: AudioClip): boolean {
  const page = getPage(draft, pageId);
  const list = (page.audio ??= []);
  if (list.length >= 40) return false;
  list.push(structuredClone(clip) as DraftClip);
  return true;
}

export function updateClip(
  draft: Draft<Project>,
  pageId: string,
  clipId: string,
  recipe: (clip: DraftClip) => void,
): void {
  const clip = getPage(draft, pageId).audio?.find((c) => c.id === clipId);
  if (clip) recipe(clip);
}

export function removeClip(draft: Draft<Project>, pageId: string, clipId: string): void {
  const page = getPage(draft, pageId);
  if (!page.audio) return;
  page.audio = page.audio.filter((c) => c.id !== clipId);
  if (!page.audio.length) delete page.audio;
}

/** The sound effect that plays when the page opens (a page clip at 0 s). */
export function setPageOpenSound(
  draft: Draft<Project>,
  pageId: string,
  soundId: string | undefined,
): void {
  const id = openSoundClipId(pageId);
  removeClip(draft, pageId, id);
  if (!soundId || !draft.sounds[soundId]) return;
  const clip = createClip({ kind: 'sound', soundId }, { kind: 'time', group: 0, at: 0 });
  addClip(draft, pageId, { ...clip, id });
}

/**
 * A sound effect when the element is tapped: added to its existing tap (keeping its wiggle and
 * other reactions), or a new tap. Respects 8 actions per tap and 4 taps per element.
 */
export function addSoundToTap(
  draft: Draft<Project>,
  pageId: string,
  elementId: string,
  soundId: string,
): boolean {
  const el = findElement(getPage(draft, pageId).elements, elementId);
  if (!el) return false;
  const action: StoryAction = { type: 'playSound', soundId };
  const tap = el.interactions?.find((i) => i.trigger === 'tap' && i.actions.length < 8);
  if (tap) {
    tap.actions.push(action);
    return true;
  }
  if ((el.interactions?.length ?? 0) >= 4) return false;
  el.interactions = [
    ...(el.interactions ?? []),
    { id: newId('ia'), trigger: 'tap', once: false, actions: [action] },
  ];
  return true;
}
