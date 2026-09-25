import { produce } from 'immer';
import type { z } from 'zod';
import { cleanReferences } from '../ops/references';
import { DEFAULT_READER } from '../schema/defaults';
import { projectSchema, SCHEMA_VERSION } from '../schema/project';
import type { Project } from '../schema/types';

/**
 * Loading pipeline: raw JSON → migrations (one version step at a time) → zod validation → repair.
 *
 * To change the schema: bump SCHEMA_VERSION, then append a migration here, e.g.
 *
 *   { from: 1, to: 2, migrate: (doc) => ({ ...doc, schemaVersion: 2, pages: ... }) }
 *
 * Migrations operate on untyped JSON because by definition the old shape no longer matches
 * the current types.
 */
export type JsonObject = Record<string, unknown>;
export type Migration = { from: number; to: number; migrate: (doc: JsonObject) => JsonObject };

export const MIGRATIONS: readonly Migration[] = [
  {
    // v2 adds characters, interactivity and reader settings. Everything new is optional or
    // defaulted, so existing books only gain the two new top-level fields.
    from: 1,
    to: 2,
    migrate: (doc) => ({
      ...doc,
      schemaVersion: 2,
      characters: isObject(doc.characters) ? doc.characters : {},
      reader: isObject(doc.reader) ? doc.reader : { ...DEFAULT_READER },
    }),
  },
  {
    // v3 adds sounds (a book-level list, a "play a sound" action, a page-turn sound).
    from: 2,
    to: 3,
    migrate: (doc) => ({
      ...doc,
      schemaVersion: 3,
      sounds: isObject(doc.sounds) ? doc.sounds : {},
    }),
  },
  {
    // v4 adds text auto-fit, groups and speech bubbles — all optional, so nothing to convert.
    from: 3,
    to: 4,
    migrate: (doc) => ({ ...doc, schemaVersion: 4 }),
  },
  {
    // v5 adds uploaded voiceover (languages; lines on pages, bubbles and taps) and a page's
    // "when it opens" sound effect. Only the book-level language list needs a default.
    from: 4,
    to: 5,
    migrate: (doc) => ({
      ...doc,
      schemaVersion: 5,
      voiceover: isObject(doc.voiceover) ? doc.voiceover : { languages: [] },
    }),
  },
  {
    // v6 adds justified text (optional style fields) and the book's text language.
    from: 5,
    to: 6,
    migrate: (doc) => ({
      ...doc,
      schemaVersion: 6,
      language: typeof doc.language === 'string' ? doc.language : 'en',
    }),
  },
];

export class ProjectLoadError extends Error {
  constructor(
    message: string,
    readonly reason: 'not-an-object' | 'too-new' | 'no-migration' | 'invalid',
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = 'ProjectLoadError';
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function migrate(
  raw: unknown,
  migrations: readonly Migration[] = MIGRATIONS,
  target: number = SCHEMA_VERSION,
): JsonObject {
  if (!isObject(raw)) throw new ProjectLoadError('Project data is not an object', 'not-an-object');
  let doc = raw;
  let version = typeof doc.schemaVersion === 'number' ? doc.schemaVersion : 0;
  if (version > target) {
    throw new ProjectLoadError(
      `This book was made with a newer version (schema ${version}). Please update the app.`,
      'too-new',
    );
  }
  while (version < target) {
    const step = migrations.find((m) => m.from === version);
    if (!step) {
      throw new ProjectLoadError(`No migration from schema version ${version}`, 'no-migration');
    }
    doc = step.migrate(structuredClone(doc));
    if (doc.schemaVersion !== step.to) doc = { ...doc, schemaVersion: step.to };
    version = step.to;
  }
  return doc;
}

/**
 * Fixes recoverable inconsistencies instead of rejecting the whole book: animation steps that
 * point at deleted elements, actions that point at deleted pages or steps, and so on.
 */
export function repairProject(project: Project): Project {
  return produce(project, (draft) => cleanReferences(draft));
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 20).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
}

/** Migrates, validates and repairs raw project JSON. Throws ProjectLoadError on failure. */
export function parseProject(raw: unknown, migrations: readonly Migration[] = MIGRATIONS): Project {
  const migrated = migrate(raw, migrations);
  const result = projectSchema.safeParse(migrated);
  if (!result.success) {
    throw new ProjectLoadError('Project data is invalid', 'invalid', formatIssues(result.error));
  }
  return repairProject(result.data);
}

export type LoadResult =
  { ok: true; project: Project } | { ok: false; error: ProjectLoadError; raw: unknown };

export function loadProject(raw: unknown): LoadResult {
  try {
    return { ok: true, project: parseProject(raw) };
  } catch (err) {
    const error =
      err instanceof ProjectLoadError
        ? err
        : new ProjectLoadError(err instanceof Error ? err.message : String(err), 'invalid');
    return { ok: false, error, raw };
  }
}
