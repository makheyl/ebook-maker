import { newId } from '../ids';
import type { Project } from '../schema/types';

/**
 * The same book under a new id, for "Keep both" when this browser already has it. Page,
 * element, step and interaction ids are per book, so every internal reference stays valid.
 */
export function asCopy(project: Project, now = new Date().toISOString()): Project {
  const suffix = ' (imported)';
  return {
    ...project,
    id: newId('bk'),
    title: `${project.title.slice(0, 200 - suffix.length)}${suffix}`,
    createdAt: now,
    updatedAt: now,
  };
}

/** True when the copy in this browser was changed after the file was exported. */
export function localIsNewer(localUpdatedAt: string, imported: Project): boolean {
  return Date.parse(localUpdatedAt) > Date.parse(imported.updatedAt) + 1000;
}
