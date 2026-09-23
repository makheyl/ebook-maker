import { describe, expect, it } from 'vitest';
import { createProject, createTextElement } from '../schema/factories';
import { SCHEMA_VERSION } from '../schema/project';
import { loadProject, migrate, parseProject, ProjectLoadError, type Migration } from './index';

describe('migrations pipeline', () => {
  it('passes a current-version project through unchanged', () => {
    const project = createProject();
    expect(parseProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
  });

  it('applies migrations one version at a time, in order', () => {
    const calls: string[] = [];
    const migrations: Migration[] = [
      {
        from: 1,
        to: 2,
        migrate: (d) => (calls.push('1→2'), { ...d, renamed: d.title, schemaVersion: 2 }),
      },
      { from: 2, to: 3, migrate: (d) => (calls.push('2→3'), { ...d, extra: true }) },
    ];
    const result = migrate({ schemaVersion: 1, title: 'Old' }, migrations, 3);
    expect(calls).toEqual(['1→2', '2→3']);
    expect(result).toMatchObject({ schemaVersion: 3, renamed: 'Old', extra: true });
  });

  it('treats a missing schemaVersion as version 0', () => {
    const migrations: Migration[] = [
      { from: 0, to: 1, migrate: (d) => ({ ...d, schemaVersion: 1 }) },
    ];
    expect(migrate({}, migrations, 1).schemaVersion).toBe(1);
  });

  it('does not mutate the input document', () => {
    const input = { schemaVersion: 1, nested: { a: 1 } };
    const migrations: Migration[] = [
      {
        from: 1,
        to: 2,
        migrate: (d) => {
          (d.nested as { a: number }).a = 2;
          return d;
        },
      },
    ];
    migrate(input, migrations, 2);
    expect(input.nested.a).toBe(1);
  });

  it('refuses books from a newer schema', () => {
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION + 1 })).toThrow(ProjectLoadError);
  });

  it('reports a missing migration step', () => {
    expect(() => migrate({ schemaVersion: 0 }, [], 1)).toThrow(/No migration/);
  });

  it('returns a structured error for corrupt data instead of throwing', () => {
    const result = loadProject({ schemaVersion: SCHEMA_VERSION, pages: 'nope' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe('invalid');
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
    expect(loadProject('garbage').ok).toBe(false);
  });

  it('repairs animation steps that reference deleted elements', () => {
    const project = createProject();
    const el = createTextElement('Hi', { x: 0, y: 0, width: 10, height: 10 });
    project.pages[0]!.elements.push(el);
    const step = {
      id: 'a1',
      elementId: el.id,
      kind: 'entrance' as const,
      preset: 'fadeIn',
      trigger: 'onPageEnter' as const,
      duration: 500,
      delay: 0,
      easing: 'easeOut',
    };
    project.pages[0]!.animations.push(step, { ...step, id: 'a2', elementId: 'gone' });
    const loaded = parseProject(JSON.parse(JSON.stringify(project)));
    expect(loaded.pages[0]!.animations.map((a) => a.id)).toEqual(['a1']);
  });
});
