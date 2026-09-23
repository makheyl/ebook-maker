import { describe, expect, it } from 'vitest';
import {
  createImageElement,
  createProject,
  createShapeElement,
  createTextElement,
} from './factories';
import { projectSchema } from './project';
import { normalizeParagraphs, paragraphsFromPlainText, plainText } from './text';

function sampleProject() {
  const project = createProject({ title: 'Test book' });
  const page = project.pages[0]!;
  const asset = {
    id: 'asset1',
    kind: 'image' as const,
    mime: 'image/webp',
    width: 800,
    height: 600,
    bytes: 1000,
  };
  project.assets[asset.id] = asset;
  page.elements.push(
    createTextElement('Hello', { x: 10, y: 10, width: 300, height: 80 }),
    createImageElement(asset, { x: 0, y: 0, width: 400, height: 400 }),
    createShapeElement('ellipse', { x: 5, y: 5, width: 50, height: 50 }),
  );
  return project;
}

describe('project schema', () => {
  it('accepts a project built by the factories', () => {
    const result = projectSchema.safeParse(sampleProject());
    expect(result.success).toBe(true);
  });

  it('round-trips through JSON', () => {
    const project = sampleProject();
    const parsed = projectSchema.parse(JSON.parse(JSON.stringify(project)));
    expect(parsed).toEqual(project);
  });

  it('rejects a book with no pages', () => {
    const project = { ...sampleProject(), pages: [] };
    expect(projectSchema.safeParse(project).success).toBe(false);
  });

  it('rejects CSS values that could load remote resources or break out of a declaration', () => {
    for (const color of [
      'url(https://evil.test/x.png)',
      'red; background: blue',
      'var(--x)',
      'red}',
    ]) {
      const project = sampleProject();
      project.pages[0]!.background = { type: 'color', color };
      expect(projectSchema.safeParse(project).success, color).toBe(false);
    }
  });

  it('accepts common color formats', () => {
    for (const color of [
      '#fff',
      '#6d4aff80',
      'rgb(1, 2, 3)',
      'rgba(0,0,0,0.5)',
      'hsl(200 50% 50%)',
      'transparent',
      'oklch(0.5 0.2 285 / 50%)',
    ]) {
      const project = sampleProject();
      project.pages[0]!.background = { type: 'color', color };
      expect(projectSchema.safeParse(project).success, color).toBe(true);
    }
  });

  it('rejects unknown element types', () => {
    const project = sampleProject() as unknown as { pages: { elements: unknown[] }[] };
    project.pages[0]!.elements.push({ id: 'x', type: 'video' });
    expect(projectSchema.safeParse(project).success).toBe(false);
  });

  it('uses the 4:3 landscape page size by default', () => {
    expect(createProject().pageSize).toEqual({ width: 1600, height: 1200 });
  });
});

describe('rich text helpers', () => {
  it('converts between plain text and paragraphs', () => {
    const paragraphs = paragraphsFromPlainText('one\r\ntwo\nthree');
    expect(paragraphs).toHaveLength(3);
    expect(plainText(paragraphs)).toBe('one\ntwo\nthree');
  });

  it('merges adjacent runs with the same marks and drops empty runs', () => {
    const result = normalizeParagraphs([
      { runs: [{ text: 'a', bold: true }, { text: 'b', bold: true }, { text: '' }, { text: 'c' }] },
      { runs: [] },
    ]);
    expect(result).toEqual([
      { runs: [{ text: 'ab', bold: true }, { text: 'c' }] },
      { runs: [{ text: '' }] },
    ]);
  });
});
