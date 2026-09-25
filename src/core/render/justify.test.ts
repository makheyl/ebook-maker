import { describe, expect, it } from 'vitest';
import { migrate } from '../migrations';
import {
  createProject,
  createTextElement,
  projectSchema,
  type Project,
  type TextStyle,
} from '../schema';
import { buildText } from './nodes';

const text = (style: Partial<TextStyle> = {}) =>
  createTextElement(
    'A long story about a small fox',
    { x: 0, y: 0, width: 200, height: 80 },
    {
      style,
    },
  );

describe('justified text', () => {
  it('justifies with a normal last line, hyphenating by default', () => {
    const box = buildText(text({ align: 'justify' }));
    expect(box.style.textAlign).toBe('justify');
    expect(box.style.textAlignLast).toBe('start');
    expect(box.style.hyphens).toBe('auto');
  });

  it('can turn hyphenation off, and never hyphenates text that types in or while measuring', () => {
    expect(buildText(text({ align: 'justify', hyphenate: false })).style.hyphens).toBe('manual');
    expect(buildText(text({ align: 'justify' }), 'words').style.hyphens).toBe('manual');
    expect(buildText(text({ align: 'justify' }), false, { measuring: true }).style.hyphens).toBe(
      'manual',
    );
    // Other alignments don't hyphenate unless asked.
    expect(buildText(text({ align: 'left' })).style.hyphens).toBe('manual');
    expect(buildText(text({ align: 'left', hyphenate: true })).style.hyphens).toBe('auto');
  });

  it('a v5 book gets a book language; the schema accepts justify', () => {
    const v5 = { ...createProject(), schemaVersion: 5 } as Record<string, unknown>;
    delete v5.language;
    const migrated = migrate(v5) as Project;
    expect(migrated.language).toBe('en');
    migrated.pages[0]!.elements.push(text({ align: 'justify', hyphenate: true }));
    expect(projectSchema.safeParse(migrated).success).toBe(true);
  });
});
