import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createAnimationStep } from '../animation/factory';
import { buildSingleFile, buildZip, type ExportInputs } from '../export/build';
import { BOOK_DATA_ID, type BookData } from '../export/format';
import { validateInteractivity } from '../interaction/validate';
import v1Book from '../migrations/__fixtures__/v1-book.json';
import {
  createButtonElement,
  createImageElement,
  createPage,
  createProject,
  createTextElement,
  projectAssetIds,
  type AssetRef,
  type Project,
} from '../schema';
import { escapeJsonForHtml } from '../export/escape';
import { asCopy, localIsNewer } from './copy';
import { decodeDataUri, detectKind, ImportError, parseImport } from './read';

const EVIL = '</script><script>alert(1)</script><!-- &     🦊';

const image = (id: string, extra: Partial<AssetRef> = {}): AssetRef => ({
  id,
  kind: 'image',
  mime: 'image/webp',
  width: 40,
  height: 30,
  bytes: 8,
  name: `${id}.png`,
  ...extra,
});

/** A book that uses everything: hidden picture, background, character + pose, choice, flap, sounds. */
function richBook(): Project {
  const p1 = createPage();
  const p2 = createPage();
  const p3 = createPage();
  const project = createProject({ title: `Import ${EVIL}`, pages: [p1, p2, p3] });
  const assets = {
    img_visible: image('img_visible'),
    img_hidden: image('img_hidden'),
    img_bg: image('img_bg'),
    img_pip: image('img_pip', { mime: 'image/png', hasAlpha: true }),
    img_pose: image('img_pose', { mime: 'image/png' }),
    img_offstage: image('img_offstage'),
  };
  project.assets = assets;
  project.characters = {
    ch_pip: {
      id: 'ch_pip',
      name: 'Pip',
      assetId: 'img_pip',
      pivot: { x: 0.5, y: 0.9 },
      facing: 'left',
      shadow: { enabled: true, opacity: 0.4, size: 1.2 },
      idle: { preset: 'sway', intensity: 0.8 },
      warp: true,
      poses: [{ id: 'po_blink', name: 'blink', assetId: 'img_pose' }],
    },
    // A character that isn't on any page yet still belongs to the book.
    ch_owl: {
      id: 'ch_owl',
      name: 'Owl',
      assetId: 'img_offstage',
      pivot: { x: 0.5, y: 1 },
      facing: 'right',
      shadow: { enabled: false, opacity: 0.3, size: 1 },
      idle: null,
      warp: false,
      poses: [],
    },
  };
  project.sounds = {
    snd_ding: { id: 'snd_ding', kind: 'audio', mime: 'audio/mpeg', bytes: 6, name: 'ding' },
    snd_spare: { id: 'snd_spare', kind: 'audio', mime: 'audio/wav', bytes: 6, name: 'spare' },
  };
  project.reader = { ...project.reader, tapToAdvance: false, pageTurnSound: 'snd_ding' };
  project.exportSettings = { format: 'zip', showBadge: false };

  p1.background = { type: 'image', assetId: 'img_bg', fit: 'cover', color: '#000000' };
  const text = createTextElement(EVIL, { x: 10, y: 10, width: 300, height: 80 });
  const visible = createImageElement(assets.img_visible, { x: 0, y: 100, width: 40, height: 30 });
  const hidden = createImageElement(
    assets.img_hidden,
    { x: 0, y: 200, width: 40, height: 30 },
    {
      hidden: true,
    },
  );
  const pip = createImageElement(
    assets.img_pip,
    { x: 500, y: 300, width: 40, height: 30 },
    {
      characterId: 'ch_pip',
    },
  );
  const reaction = createAnimationStep(pip.id, 'wiggle', 'onInteraction');
  pip.interactions = [
    {
      id: 'ia_pip',
      trigger: 'tap',
      once: false,
      actions: [{ type: 'playStep', stepId: reaction.id }],
    },
  ];
  const custom = {
    ...createAnimationStep(visible.id, 'keyframes', 'onClick'),
    tracks: [
      {
        property: 'x' as const,
        keyframes: [
          { t: 0, v: 0 },
          { t: 1, v: 120, easing: 'easeOut' },
        ],
      },
    ],
  };
  const choice = createButtonElement(
    'Go to 3',
    { x: 0, y: 400, width: 200, height: 60 },
    {
      icon: 'arrowRight',
      interactions: [
        {
          id: 'ia_choice',
          trigger: 'tap',
          once: true,
          actions: [
            { type: 'playSound', soundId: 'snd_ding' },
            { type: 'goToPage', pageId: p3.id },
          ],
        },
      ],
    },
  );
  p1.elements.push(text, visible, hidden, pip, choice);
  p1.animations.push(createAnimationStep(text.id, 'typewriter'), reaction, custom);
  p1.flow = { lockNext: true };
  p2.goal = { count: 1, label: 'Find it' };
  p2.flow = { next: 'end', lockNext: true };
  const star = createButtonElement(
    'Star',
    { x: 5, y: 5, width: 50, height: 50 },
    {
      interactions: [
        { id: 'ia_star', trigger: 'tap', once: false, actions: [{ type: 'collect' }] },
      ],
    },
  );
  p2.elements.push(star);
  p3.transition = { preset: 'flip', duration: 900 };
  return project;
}

/** Deterministic, distinct bytes per stored file. */
const bytesFor = (id: string) => new TextEncoder().encode(`file:${id}`);

function inputs(project: Project): ExportInputs {
  return {
    project,
    playerJs: 'window.__player = "</script>";',
    playerCss: '.fp-root{}',
    showBadge: true,
    fontFiles: [],
    getAsset: async (id) => {
      const mime = project.sounds[id]?.mime ?? project.assets[id]?.mime;
      return mime ? new Blob([bytesFor(id)], { type: mime }) : undefined;
    },
    getFont: async () => new ArrayBuffer(0),
  };
}

const exportBytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

async function roundTrip(format: 'html' | 'zip', project = richBook()) {
  const exported =
    format === 'html' ? await buildSingleFile(inputs(project)) : await buildZip(inputs(project));
  return parseImport(exported.filename, await exportBytes(exported.blob));
}

describe('import: round trip', () => {
  for (const format of ['html', 'zip'] as const) {
    it(`restores the whole book and every file byte-for-byte (${format})`, async () => {
      const original = richBook();
      const parsed = await roundTrip(format, original);
      expect(parsed.source).toBe(format);
      expect(parsed.project).toEqual(original);
      expect(parsed.missing).toEqual([]);
      const ids = projectAssetIds(original).sort();
      expect(parsed.files.map((f) => f.id).sort()).toEqual(ids);
      for (const file of parsed.files) {
        expect([...file.bytes], file.id).toEqual([...bytesFor(file.id)]);
        expect(file.kind).toBe(original.sounds[file.id] ? 'audio' : 'image');
      }
      // Nothing new for the editor's checks to complain about.
      expect(validateInteractivity(parsed.project)).toEqual(validateInteractivity(original));
    });
  }

  it('can be repeated forever without changes (export → import → export)', async () => {
    const first = await buildSingleFile(inputs(richBook()));
    const parsed = await parseImport('a.html', await exportBytes(first.blob));
    const again = await buildSingleFile({
      ...inputs(parsed.project),
      getAsset: async (id) => {
        const f = parsed.files.find((x) => x.id === id);
        return f ? new Blob([f.bytes as BlobPart], { type: f.mime }) : undefined;
      },
    });
    const data = async (blob: Blob): Promise<BookData> => {
      const doc = new DOMParser().parseFromString(await blob.text(), 'text/html');
      return JSON.parse(doc.getElementById(BOOK_DATA_ID)!.textContent!);
    };
    const [a, b] = [await data(first.blob), await data(again.blob)];
    expect(b.project).toEqual(a.project);
    expect(b.assets).toEqual(a.assets);
    expect(b.generator?.formatVersion).toBe(2);
  });

  it('finds the book when the ZIP folder was re-zipped inside another folder', async () => {
    const exported = await buildZip(inputs(richBook()));
    const inner = await JSZip.loadAsync(await exported.blob.arrayBuffer());
    const outer = new JSZip();
    for (const [name, entry] of Object.entries(inner.files)) {
      if (!entry.dir) outer.file(`My book/${name}`, await entry.async('uint8array'));
    }
    outer.file('__MACOSX/My book/._index.html', 'junk');
    const bytes = await outer.generateAsync({ type: 'uint8array' });
    const parsed = await parseImport('copy.zip', bytes);
    expect(parsed.missing).toEqual([]);
    expect(parsed.files).toHaveLength(projectAssetIds(richBook()).length);
  });
});

describe('import: older and partial files', () => {
  it('upgrades a book saved with an older schema', async () => {
    const data = {
      format: 'folio-book',
      schemaVersion: 1,
      project: v1Book,
      assets: {},
      options: { showBadge: true },
    };
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    const parsed = await parseImport('old.json', bytes);
    expect(parsed.sourceSchema).toBe(1);
    expect(parsed.project.characters).toEqual({});
    expect(parsed.project.sounds).toEqual({});
    // Its picture wasn't in the file: listed as missing, the reference kept.
    expect(parsed.missing.map((m) => m.id)).toEqual(['img_abc']);
    expect(
      parsed.project.pages[0]!.elements.some((e) => e.type === 'image' && e.assetId === 'img_abc'),
    ).toBe(true);
  });

  it('imports a raw project backup; its files are reported as not in the file', async () => {
    const project = richBook();
    const parsed = await parseImport(
      'backup.json',
      new TextEncoder().encode(JSON.stringify(project)),
    );
    expect(parsed.project).toEqual(project);
    expect(parsed.files).toEqual([]);
    expect(parsed.missing).toHaveLength(projectAssetIds(project).length);
  });

  it('lists files that were left out, and keeps going', async () => {
    const exported = await buildSingleFile({
      ...inputs(richBook()),
      getAsset: async (id) => (id === 'img_hidden' ? undefined : inputs(richBook()).getAsset(id)),
    });
    const parsed = await parseImport('old-export.html', await exportBytes(exported.blob));
    expect(parsed.missing).toEqual([
      {
        id: 'img_hidden',
        kind: 'image',
        name: 'img_hidden.png',
        reason: 'not included in this file',
      },
    ]);
  });
});

describe('import: untrusted files', () => {
  const html = (data: unknown) =>
    new TextEncoder().encode(
      `<!doctype html><html><body><script type="application/json" id="book-data">${escapeJsonForHtml(JSON.stringify(data))}</script></body></html>`,
    );
  const book = (patch: Partial<BookData> = {}) => ({
    format: 'folio-book',
    schemaVersion: 3,
    project: richBook(),
    assets: {},
    options: { showBadge: true },
    ...patch,
  });
  const reason = async (name: string, bytes: Uint8Array) => {
    try {
      await parseImport(name, bytes);
      return 'imported';
    } catch (err) {
      return err instanceof ImportError ? err.reason : `unexpected: ${String(err)}`;
    }
  };

  it('rejects files that are not Folio books, with a reason', async () => {
    expect(await reason('x.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe('unknown-file');
    expect(await reason('x.html', new TextEncoder().encode('<!doctype html><p>hi</p>'))).toBe(
      'not-folio',
    );
    expect(await reason('x.html', html({ ...book(), format: 'other' }))).toBe('not-folio');
    expect(await reason('x.json', new TextEncoder().encode('{"hello": 1}'))).toBe('not-folio');
    const broken = new TextEncoder().encode(
      '<!doctype html><script type="application/json" id="book-data">{nope</script>',
    );
    expect(await reason('x.html', broken)).toBe('damaged');
    expect(await reason('x.zip', new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toBe(
      'damaged',
    );
  });

  it('rejects invalid and too-new books', async () => {
    const invalid = book({
      project: { ...richBook(), pages: [{ id: 'pg_bad', elements: 'nope' }] } as unknown as Project,
    });
    expect(await reason('x.html', html(invalid))).toBe('invalid');
    const future = book({ project: { ...richBook(), schemaVersion: 99 } as unknown as Project });
    expect(await reason('x.html', html(future))).toBe('too-new');
  });

  it('never follows links, and checks each file type and size', async () => {
    const good = `data:image/webp;base64,${btoa('ok')}`;
    const parsed = await parseImport(
      'x.html',
      html(
        book({
          assets: {
            img_visible: 'https://example.com/steal.webp',
            img_hidden: 'blob:https://example.com/1',
            img_bg: `data:text/html;base64,${btoa('<script>')}`,
            img_pip: good,
            img_pose: `data:audio/mpeg;base64,${btoa('x')}`,
            snd_ding: `data:audio/mpeg;base64,${btoa('x'.repeat(2 * 1024 * 1024 + 1))}`,
          },
        }),
      ),
    );
    const why = Object.fromEntries(parsed.missing.map((m) => [m.id, m.reason]));
    expect(why.img_visible).toMatch(/links are not imported/);
    expect(why.img_hidden).toMatch(/links are not imported/);
    expect(why.img_bg).toBe('not a supported picture');
    expect(why.img_pose).toBe('not a supported picture');
    expect(why.snd_ding).toBe('sound is over 2 MB');
    expect(parsed.files.map((f) => f.id)).toEqual(['img_pip']);
  });

  it('only reads files from the ZIP assets folder', async () => {
    const exported = await buildZip(inputs(richBook()));
    const zip = await JSZip.loadAsync(await exported.blob.arrayBuffer());
    const index = await zip.file('index.html')!.async('string');
    const doc = new DOMParser().parseFromString(index, 'text/html');
    const data = JSON.parse(doc.getElementById(BOOK_DATA_ID)!.textContent!) as BookData;
    data.assets.img_visible = '../../etc/passwd';
    data.assets.img_hidden = '/abs/path.webp';
    zip.file('index.html', html(data));
    const parsed = await parseImport('evil.zip', await zip.generateAsync({ type: 'uint8array' }));
    const why = Object.fromEntries(parsed.missing.map((m) => [m.id, m.reason]));
    expect(why.img_visible).toMatch(/not stored inside the ZIP/);
    expect(why.img_hidden).toMatch(/not stored inside the ZIP/);
  });

  it('recognises file kinds and decodes data URIs', () => {
    const t = (s: string) => new TextEncoder().encode(s);
    expect(detectKind(t('\uFEFF  <!DOCTYPE html>'), 'a.txt')).toBe('html');
    expect(detectKind(t('{"a":1}'), 'a')).toBe('json');
    expect(detectKind(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), 'a')).toBe('zip');
    expect(detectKind(t('hello'), 'a.txt')).toBeNull();
    expect(decodeDataUri(`data:image/png;base64,${btoa('hi')}`)).toEqual({
      mime: 'image/png',
      bytes: new Uint8Array([104, 105]),
    });
    expect(decodeDataUri('data:image/png,hi')).toBeNull();
    expect(decodeDataUri('https://x')).toBeNull();
  });
});

describe('import: copies', () => {
  it('"Keep both" gives the book a new id and keeps every reference inside it working', () => {
    const original = richBook();
    const copy = asCopy(original, '2030-01-01T00:00:00.000Z');
    expect(copy.id).not.toBe(original.id);
    expect(copy.title).toMatch(/\(imported\)$/);
    expect(copy.title.length).toBeLessThanOrEqual(200);
    expect(copy.pages).toBe(original.pages);
    expect(validateInteractivity(copy)).toEqual(validateInteractivity(original));
  });

  it('notices when this browser has newer edits than the file', () => {
    const p = { ...richBook(), updatedAt: '2030-01-01T00:00:00.000Z' };
    expect(localIsNewer('2030-01-02T00:00:00.000Z', p)).toBe(true);
    expect(localIsNewer('2030-01-01T00:00:00.500Z', p)).toBe(false);
  });
});
