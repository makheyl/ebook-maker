import type { z } from 'zod';
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

export const MIGRATIONS: readonly Migration[] = [];

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
 * Fixes recoverable inconsistencies instead of rejecting the whole book:
 * animation steps that point at deleted elements are dropped.
 */
export function repairProject(project: Project): Project {
  let changed = false;
  const pages = project.pages.map((page) => {
    const ids = new Set(page.elements.map((e) => e.id));
    const animations = page.animations.filter((a) => ids.has(a.elementId));
    if (animations.length === page.animations.length) return page;
    changed = true;
    return { ...page, animations };
  });
  return changed ? { ...project, pages } : project;
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
