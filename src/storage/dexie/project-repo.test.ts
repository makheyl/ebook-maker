// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createImageElement, createProject, createTextElement } from '@/core/schema';
import { DexieAssetRepository } from './asset-repo';
import { FolioDatabase } from './db';
import { DexieProjectRepository } from './project-repo';

let db: FolioDatabase;
let projects: DexieProjectRepository;
let assets: DexieAssetRepository;

beforeEach(() => {
  db = new FolioDatabase(`test-${Math.random()}`);
  projects = new DexieProjectRepository(db);
  assets = new DexieAssetRepository(db);
});

afterEach(async () => {
  db.close();
  await db.delete();
});

function bookWithImage(assetId: string) {
  const project = createProject({ title: 'With image' });
  const ref = {
    id: assetId,
    kind: 'image' as const,
    mime: 'image/webp',
    width: 10,
    height: 10,
    bytes: 3,
  };
  project.assets[assetId] = ref;
  project.pages[0]!.elements.push(createImageElement(ref, { x: 0, y: 0, width: 10, height: 10 }));
  return project;
}

async function putAsset(id: string, createdAt = 0) {
  const blob = new Blob(['abc'], { type: 'image/webp' });
  await assets.put({
    id,
    blob,
    thumb: blob,
    mime: 'image/webp',
    width: 10,
    height: 10,
    bytes: 3,
    createdAt,
  });
}

describe('DexieProjectRepository', () => {
  it('saves, lists and loads projects', async () => {
    const project = createProject({ title: 'My book' });
    project.pages[0]!.elements.push(createTextElement('Hi', { x: 0, y: 0, width: 10, height: 10 }));
    await projects.save(project);
    const list = await projects.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: project.id, title: 'My book', pageCount: 1 });
    const loaded = await projects.load(project.id);
    expect(loaded?.ok && loaded.project.pages[0]!.elements).toHaveLength(1);
    expect(await projects.load('missing')).toBeNull();
  });

  it('lists the most recently updated first', async () => {
    const a = createProject({ title: 'A' });
    const b = createProject({ title: 'B' });
    await projects.save(a);
    await new Promise((r) => setTimeout(r, 5));
    await projects.save(b);
    expect((await projects.list()).map((p) => p.title)).toEqual(['B', 'A']);
  });

  it('renames and duplicates', async () => {
    const project = createProject({ title: 'Original' });
    await projects.save(project);
    await projects.rename(project.id, 'Renamed');
    const copy = await projects.duplicate(project.id);
    expect(copy.id).not.toBe(project.id);
    expect(copy.title).toBe('Renamed (copy)');
    expect((await projects.list()).map((p) => p.title).sort()).toEqual([
      'Renamed',
      'Renamed (copy)',
    ]);
  });

  it('reports corrupt data instead of crashing', async () => {
    await db.projects.put({ id: 'bad', data: { schemaVersion: 1, pages: 'oops' } });
    const result = await projects.load('bad');
    expect(result?.ok).toBe(false);
    expect(await projects.loadRaw('bad')).toEqual({ schemaVersion: 1, pages: 'oops' });
  });

  it('garbage-collects assets no remaining book references', async () => {
    await putAsset('shared');
    await putAsset('only-in-a');
    await putAsset('fresh-upload', Date.now());
    const a = bookWithImage('only-in-a');
    const b = bookWithImage('shared');
    const c = bookWithImage('shared');
    await Promise.all([projects.save(a), projects.save(b), projects.save(c)]);

    await projects.delete(a.id);
    expect(await assets.has('only-in-a')).toBe(false);
    expect(await assets.has('shared')).toBe(true);
    expect(await assets.has('fresh-upload')).toBe(true); // within the grace period

    await projects.delete(b.id);
    expect(await assets.has('shared')).toBe(true); // still used by c
  });
});

describe('DexieAssetRepository', () => {
  it('deduplicates by id', async () => {
    await putAsset('x');
    await putAsset('x');
    expect(await assets.count()).toBe(1);
  });
});
