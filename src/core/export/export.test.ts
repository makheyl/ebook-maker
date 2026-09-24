import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { FontFace } from '../fonts/catalog';
import {
  createButtonElement,
  createImageElement,
  createProject,
  createTextElement,
  type Project,
} from '../schema';
import { buildSingleFile, buildZip, estimateSize, renderBookHtml, selectFontFaces } from './build';
import { escapeHtml, escapeInlineCode, escapeJsonForHtml, slugify } from './escape';
import { BOOK_DATA_ID, isBookData } from './format';
import { usedAssetIds, usedFontFaces, usedSoundIds } from './usage';

const EVIL = '</script><script>alert(1)</script><!-- &   "quotes"';

function evilProject(): Project {
  const project = createProject({ title: `My ${EVIL} book` });
  const asset = {
    id: 'img1',
    kind: 'image' as const,
    mime: 'image/png',
    width: 10,
    height: 10,
    bytes: 4,
  };
  project.assets.img1 = asset;
  project.assets.unused = { ...asset, id: 'unused' };
  project.pages[0]!.elements.push(
    createTextElement(
      EVIL,
      { x: 0, y: 0, width: 100, height: 100 },
      { style: { fontFamily: 'lora', italic: true } },
    ),
    createImageElement(asset, { x: 0, y: 0, width: 10, height: 10 }),
  );
  return project;
}

const FONT_FILES: FontFace[] = [
  { fontId: 'lora', style: 'normal', subset: 'latin', src: '/lora-n.woff2' },
  { fontId: 'lora', style: 'italic', subset: 'latin', src: '/lora-i.woff2' },
  { fontId: 'lora', style: 'italic', subset: 'latin-ext', src: '/lora-i-ext.woff2' },
  { fontId: 'inter', style: 'normal', subset: 'latin', src: '/inter.woff2' },
];

function inputs(project: Project) {
  return {
    project,
    playerJs: 'window.__player = "</script>";',
    playerCss: '.fp-root{color:red}',
    showBadge: true,
    fontFiles: FONT_FILES,
    getAsset: async (id: string) =>
      id === 'img1' ? new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }) : undefined,
    getFont: async () => new Uint8Array([9, 9, 9]).buffer,
  };
}

function parse(html: string) {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('escaping', () => {
  it('JSON stays valid and cannot close the script tag', () => {
    const json = JSON.stringify({ text: EVIL });
    const safe = escapeJsonForHtml(json);
    expect(safe).not.toMatch(/<|>|&/);
    expect(safe).not.toContain(' ');
    expect(JSON.parse(safe)).toEqual({ text: EVIL });
  });

  it('escapes HTML text and attributes', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('guards inline code against </script> and <!--', () => {
    expect(escapeInlineCode('a="</SCRIPT>";b="<!--"', 'script')).toBe('a="<\\/SCRIPT>";b="<\\!--"');
  });

  it('slugifies titles for file names', () => {
    expect(slugify('  Élan: The Book!! ')).toBe('elan-the-book');
    expect(slugify('***')).toBe('book');
  });
});

describe('usage', () => {
  it('exports only used assets', () => {
    expect(usedAssetIds(evilProject())).toEqual(['img1']);
  });

  it('selects only used font faces and subsets', () => {
    const project = evilProject();
    expect(usedFontFaces(project)).toEqual([{ fontId: 'lora', style: 'italic', subset: 'latin' }]);
    project.pages[0]!.elements.push(
      createTextElement('Zażółć', { x: 0, y: 0, width: 10, height: 10 }),
    );
    const faces = selectFontFaces(project, FONT_FILES).map((f) => f.src);
    expect(faces).toEqual(['/lora-i.woff2', '/inter.woff2']);
  });
});

describe('single-file export', () => {
  it('embeds data, images and fonts safely and round-trips the project', async () => {
    const project = evilProject();
    const result = await buildSingleFile(inputs(project));
    expect(result.filename).toMatch(/^my-script-script-alert-1-.*\.html$/);
    const html = await result.blob.text();
    const doc = parse(html);

    // Exactly our two scripts: the JSON data and the player.
    const scripts = doc.querySelectorAll('script');
    expect(scripts).toHaveLength(2);
    expect(scripts[0]!.id).toBe(BOOK_DATA_ID);

    const data = JSON.parse(scripts[0]!.textContent!);
    expect(isBookData(data)).toBe(true);
    expect(data.project).toEqual(project);
    expect(data.assets).toEqual({ img1: 'data:image/png;base64,AQIDBA==' });
    expect(data.options.showBadge).toBe(true);

    expect(doc.title).toBe(project.title);
    expect(doc.querySelector('meta[name=generator]')!.getAttribute('content')).toBe('Folio');
    expect(
      doc.querySelector('meta[http-equiv=Content-Security-Policy]')!.getAttribute('content'),
    ).toContain("default-src 'none'");
    const css = doc.querySelector('style')!.textContent!;
    expect(css).toContain('@font-face');
    expect(css).toContain('data:font/woff2;base64,CQkJ');
    expect(scripts[1]!.textContent).toContain('window.__player');
    // No remote URLs anywhere.
    expect(html).not.toMatch(/https?:\/\//);
  });
});

describe('zip export', () => {
  it('writes index.html with an assets folder', async () => {
    const result = await buildZip(inputs(evilProject()));
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(
      [
        'assets/',
        'assets/images/',
        'assets/images/img1.png',
        'assets/player.css',
        'assets/player.js',
        'index.html',
      ].sort(),
    );
    const html = await zip.file('index.html')!.async('string');
    const doc = parse(html);
    const data = JSON.parse(doc.getElementById(BOOK_DATA_ID)!.textContent!);
    expect(data.assets.img1).toBe('assets/images/img1.png');
    expect(doc.querySelector('script[src]')!.getAttribute('src')).toBe('assets/player.js');
  });
});

describe('sounds', () => {
  /** A book with a button that plays "ding", a page-turn "whoosh", and an unused "spare". */
  function soundBook(): Project {
    const project = createProject({ title: 'Noisy' });
    const ref = (id: string) => ({
      id,
      kind: 'audio' as const,
      mime: 'audio/mpeg' as const,
      bytes: 3,
    });
    project.sounds = {
      snd_ding: ref('snd_ding'),
      snd_whoosh: ref('snd_whoosh'),
      snd_spare: ref('snd_spare'),
    };
    project.reader.pageTurnSound = 'snd_whoosh';
    project.pages[0]!.elements.push(
      createButtonElement(
        'Ring',
        { x: 0, y: 0, width: 100, height: 40 },
        {
          interactions: [
            {
              id: 'ia',
              trigger: 'tap',
              once: false,
              actions: [{ type: 'playSound', soundId: 'snd_ding' }],
            },
          ],
        },
      ),
    );
    return project;
  }
  const audioInputs = (project: Project) => ({
    ...inputs(project),
    getAsset: async (id: string) =>
      id.startsWith('snd_')
        ? new Blob([new Uint8Array([7, 7, 7])], { type: 'audio/mpeg' })
        : undefined,
  });

  it('exports only sounds a reader can hear', () => {
    const project = soundBook();
    expect(usedSoundIds(project).sort()).toEqual(['snd_ding', 'snd_whoosh']);
    expect(usedAssetIds(project)).not.toContain('snd_spare');
    project.pages[0]!.elements[0]!.hidden = true;
    expect(usedSoundIds(project)).toEqual(['snd_whoosh']);
  });

  it('inlines audio in the single file and allows media only from data: URIs', async () => {
    const result = await buildSingleFile(audioInputs(soundBook()));
    const doc = parse(await result.blob.text());
    const data = JSON.parse(doc.getElementById(BOOK_DATA_ID)!.textContent!);
    expect(data.assets.snd_ding).toBe('data:audio/mpeg;base64,BwcH');
    const csp = doc
      .querySelector('meta[http-equiv="Content-Security-Policy"]')!
      .getAttribute('content')!;
    expect(csp).toContain('media-src data:;');
    expect(csp).toContain("default-src 'none'");
  });

  it('puts audio in assets/audio/ in the zip', async () => {
    const result = await buildZip(audioInputs(soundBook()));
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(
      expect.arrayContaining(['assets/audio/snd_ding.mp3', 'assets/audio/snd_whoosh.mp3']),
    );
    const doc = parse(await zip.file('index.html')!.async('string'));
    const csp = doc
      .querySelector('meta[http-equiv="Content-Security-Policy"]')!
      .getAttribute('content')!;
    expect(csp).toContain("media-src 'self' data:;");
  });

  it('counts audio in the size estimate', () => {
    const e = estimateSize({
      format: 'html',
      imageBytes: [],
      audioBytes: [3000],
      fontBytes: [],
      playerBytes: 0,
      projectJsonBytes: 0,
    });
    expect(e.audio).toBe(4000);
    expect(e.bytes).toBeGreaterThanOrEqual(4000);
  });
});

describe('size estimate', () => {
  it('accounts for base64 inflation in single-file mode', () => {
    const html = estimateSize({
      format: 'html',
      imageBytes: [3000, 3000],
      fontBytes: [300],
      playerBytes: 1000,
      projectJsonBytes: 500,
    });
    const zip = estimateSize({
      format: 'zip',
      imageBytes: [3000, 3000],
      fontBytes: [300],
      playerBytes: 1000,
      projectJsonBytes: 500,
    });
    expect(html.images).toBe(8000);
    expect(zip.images).toBe(6000);
    expect(html.fonts).toBe(400);
    expect(html.bytes).toBeGreaterThan(zip.bytes);
  });
});

describe('renderBookHtml', () => {
  it('escapes the author meta', () => {
    const project = { ...createProject({ title: 'T' }), author: '"><script>x</script>' };
    const html = renderBookHtml({
      project,
      assets: {},
      playerJs: '',
      playerCss: '',
      fontCss: '',
      showBadge: false,
      csp: "default-src 'none'",
    });
    expect(parse(html).querySelectorAll('script')).toHaveLength(2);
  });
});
