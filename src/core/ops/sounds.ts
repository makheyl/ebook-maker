import type { Draft } from 'immer';
import type { Project, SoundRef } from '../schema/types';
import { cleanReferences } from './references';

export function addSound(draft: Draft<Project>, sound: SoundRef): void {
  if (!draft.sounds[sound.id]) draft.sounds[sound.id] = sound;
}

/** Removes a sound and every action (and the page-turn setting) that plays it. */
export function removeSound(draft: Draft<Project>, soundId: string): void {
  delete draft.sounds[soundId];
  cleanReferences(draft);
}

export function renameSound(draft: Draft<Project>, soundId: string, name: string): void {
  const sound = draft.sounds[soundId];
  if (sound) sound.name = name.trim().slice(0, 200) || sound.name;
}
