import { describe, expect, it } from 'vitest';
import { DEFAULT_READER } from '../schema/defaults';
import { projectSchema, SCHEMA_VERSION } from '../schema/project';
import v1Book from './__fixtures__/v1-book.json';
import { loadProject, parseProject } from './index';

describe('migration v1 → v2', () => {
  it('upgrades a book saved by v1 without touching its content', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(2);
    const project = parseProject(structuredClone(v1Book));
    expect(project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(project.characters).toEqual({});
    expect(project.sounds).toEqual({}); // v3
    expect(project.reader).toEqual(DEFAULT_READER);
    expect(project.pages[0]!.elements.map((e) => e.id)).toEqual(['el_text', 'el_img', 'el_shape']);
    expect(project.pages[0]!.animations).toHaveLength(2);
    expect(project.assets.img_abc!.name).toBe('fox.png');
  });

  it('round-trips through JSON after migrating', () => {
    const project = parseProject(structuredClone(v1Book));
    const again = parseProject(JSON.parse(JSON.stringify(project)));
    expect(again).toEqual(project);
    expect(projectSchema.safeParse(again).success).toBe(true);
  });

  it('does not mutate the stored v1 data', () => {
    const raw = structuredClone(v1Book);
    loadProject(raw);
    expect(raw.schemaVersion).toBe(1);
    expect('characters' in raw).toBe(false);
  });
});
