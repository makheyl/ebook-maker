import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  addLanguages,
  createBlankBook,
  insertText,
  makeMascotPng,
  makeWav,
  uploadVoiceClip,
  waitForSaved,
} from './helpers';

/** Every clip, told apart by length. */
const CLIPS = {
  p1en: makeWav(210),
  p1tl: makeWav(220),
  p2en: makeWav(230),
  bubbleTl: makeWav(240),
  p3en: makeWav(250),
  p3tl: makeWav(260),
  pipEn: makeWav(270),
  pipTl: makeWav(280),
  goEn: makeWav(290),
  p4en: makeWav(300),
  swoosh: makeWav(150, 2),
};
type ClipName = keyof typeof CLIPS;
const nameOf = (src: string) =>
  (Object.keys(CLIPS) as ClipName[]).find((k) => src.endsWith(CLIPS[k].toString('base64')));

/** Records play() calls (voice element or not) instead of relying on audio output. */
const PLAY_SPY = () => {
  const w = window as unknown as { __plays: { src: string; voice: boolean }[] };
  w.__plays = [];
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    w.__plays.push({ src: this.src || this.currentSrc, voice: this.dataset.folio === 'voice' });
    return Promise.resolve();
  };
};
const plays = async (page: Page) =>
  (
    await page.evaluate(
      () => (window as unknown as { __plays: { src: string; voice: boolean }[] }).__plays,
    )
  ).map((p) => ({
    clip:
      nameOf(p.src) ??
      (p.src.startsWith('data:audio/wav;base64,UklGRiQAAAB') ? 'silence' : p.src.slice(0, 30)),
    voice: p.voice,
  }));
const voicePlays = async (page: Page) =>
  (await plays(page)).filter((p) => p.voice && p.clip !== 'silence').map((p) => p.clip);
const effectPlays = async (page: Page) =>
  (await plays(page)).filter((p) => !p.voice).map((p) => p.clip);
/** Ends the line being said (as if the recording finished). */
const endLine = (page: Page) =>
  page.evaluate(() =>
    document.querySelector('audio[data-folio=voice]')!.dispatchEvent(new Event('ended')),
  );

const thumb = (page: Page, n: number) =>
  page.getByRole('button', { name: `Page ${n}`, exact: true });
const clickEmpty = (page: Page) =>
  page.getByTestId('stage-page').click({ position: { x: 8, y: 8 } });
const audioTab = async (page: Page) => {
  await clickEmpty(page);
  await page.getByRole('tab', { name: 'Audio' }).click();
};

async function buildBook(page: Page) {
  await createBlankBook(page, 'Listen book');
  await insertText(page, 'Page one');
  for (const text of ['Page two', 'Page three', 'Page four']) {
    await page.getByRole('button', { name: 'Add page', exact: true }).first().click();
    await insertText(page, text);
  }
  await addLanguages(page, ['English', 'Tagalog']);

  // Page 1: voice in both languages, and Pip who speaks when tapped.
  await thumb(page, 1).click();
  await audioTab(page);
  await uploadVoiceClip(page, /Upload English voiceover for page 1/, CLIPS.p1en, 'p1en.wav');
  await uploadVoiceClip(page, /Upload Tagalog voiceover for page 1/, CLIPS.p1tl, 'p1tl.wav');
  await page
    .getByTestId('insert-character-input')
    .setInputFiles({ name: 'pip.png', mimeType: 'image/png', buffer: await makeMascotPng(page) });
  await page.getByRole('tab', { name: 'Design' }).click();
  await page.getByRole('button', { name: 'Speak when tapped' }).click();
  await uploadVoiceClip(page, /Upload English voiceover for pip/, CLIPS.pipEn, 'pipEn.wav');
  await uploadVoiceClip(page, /Upload Tagalog voiceover for pip/, CLIPS.pipTl, 'pipTl.wav');

  // Page 2: English only; a bubble that speaks Tagalog when it appears.
  await thumb(page, 2).click();
  await audioTab(page);
  await uploadVoiceClip(page, /Upload English voiceover for page 2/, CLIPS.p2en, 'p2en.wav');
  await page
    .getByRole('toolbar', { name: 'Insert' })
    .getByRole('button', { name: 'Bubble' })
    .click();
  await page.getByRole('menuitem', { name: 'Speech' }).click();
  await page.keyboard.type('Kumusta!');
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Design' }).click();
  await uploadVoiceClip(page, /Upload Tagalog voiceover for /, CLIPS.bubbleTl, 'bubbleTl.wav');

  // Page 3: both languages, and a button that speaks, then turns the page.
  await thumb(page, 3).click();
  await audioTab(page);
  await uploadVoiceClip(page, /Upload English voiceover for page 3/, CLIPS.p3en, 'p3en.wav');
  await uploadVoiceClip(page, /Upload Tagalog voiceover for page 3/, CLIPS.p3tl, 'p3tl.wav');
  await page
    .getByRole('toolbar', { name: 'Insert' })
    .getByRole('button', { name: 'Button' })
    .click();
  await page.getByRole('menuitem', { name: /Next →/ }).click();
  await page.getByRole('tab', { name: 'Interact' }).click();
  await page.getByRole('combobox', { name: 'Action 1' }).click();
  await page.getByRole('option', { name: 'Play voiceover' }).click();
  await uploadVoiceClip(page, /Upload English voiceover for/, CLIPS.goEn, 'goEn.wav');
  await page.getByRole('button', { name: 'Then…' }).click();
  await page.getByRole('menuitem', { name: 'Go to the next page' }).click();

  // Page 4: English. And a page-turn sound effect for the whole book.
  await thumb(page, 4).click();
  await audioTab(page);
  await uploadVoiceClip(page, /Upload English voiceover for page 4/, CLIPS.p4en, 'p4en.wav');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Upload sound' }).click(),
  ]);
  await chooser.setFiles({ name: 'swoosh.wav', mimeType: 'audio/wav', buffer: CLIPS.swoosh });
  await page.getByRole('combobox', { name: 'Page-turn sound' }).click();
  await page.getByRole('option', { name: 'swoosh' }).click();
  await waitForSaved(page);
}

async function exportBook(page: Page, name: string) {
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByTestId('export-estimate')).toContainText('voiceover');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download HTML' }).click(),
  ]);
  const file = test.info().outputPath(name);
  await dl.saveAs(file);
  await page.keyboard.press('Escape');
  return file;
}

test('the reader asks for a language, speaks it, falls back, and remembers', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await buildBook(page);

  // The preview speaks straight away (no card) in the default language.
  await thumb(page, 1).click();
  await page.addInitScript(PLAY_SPY);
  await page.evaluate(PLAY_SPY);
  await page.getByRole('banner').getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByTestId('preview').locator('.fp-listen')).toHaveCount(0);
  // (The preview plays from blob: URLs, so only count: one line, the page's.)
  await expect.poll(async () => (await voicePlays(page)).length).toBe(1);
  await page.keyboard.press('Escape');

  const file = await exportBook(page, 'listen.html');
  const context = await browser.newContext();
  await context.addInitScript(PLAY_SPY);
  const requests: string[] = [];
  context.on('request', (r) => requests.push(r.url()));
  const book = await context.newPage();
  const errors: string[] = [];
  book.on('pageerror', (e) => errors.push(e.message));
  await book.goto(pathToFileURL(file).href);

  // 1. The card offers exactly the uploaded languages; nothing plays before a choice.
  const card = book.getByRole('dialog', { name: 'Listen book' });
  await expect(card.getByRole('button')).toHaveText(['English', 'Tagalog', 'Read it myself']);
  await book.waitForTimeout(400);
  expect(await voicePlays(book)).toEqual([]);
  await card.getByRole('button', { name: 'Tagalog' }).click();
  await expect(card).toHaveCount(0);
  await expect.poll(() => voicePlays(book)).toEqual(['p1tl']);
  const voiceBtn = book.getByRole('button', { name: 'Voiceover: Tagalog. Change language' });
  await expect(voiceBtn).toContainText('TL');

  // 2. Tapping Pip interrupts with Pip's Tagalog line.
  await book.locator('.fp-page:not([aria-hidden]) .fl-el[data-character-id]').click();
  await expect.poll(() => voicePlays(book)).toEqual(['p1tl', 'pipTl']);

  // 3. Page 2 has no Tagalog: English plays; the bubble's line waits for it.
  await book.keyboard.press('ArrowRight');
  await expect.poll(() => voicePlays(book)).toEqual(['p1tl', 'pipTl', 'p2en']);
  await book.waitForTimeout(300);
  expect((await voicePlays(book)).at(-1)).toBe('p2en');
  await endLine(book);
  await expect.poll(async () => (await voicePlays(book)).at(-1)).toBe('bubbleTl');

  // 4. Going back is quiet; "Listen again" replays.
  const before = (await voicePlays(book)).length;
  await book.keyboard.press('ArrowLeft');
  await expect(book.locator('.fp-indicator')).toHaveText('1 / 4');
  await book.waitForTimeout(400);
  expect(await voicePlays(book)).toHaveLength(before);
  await voiceBtn.click();
  await book.getByRole('button', { name: 'Listen again' }).click();
  await expect.poll(async () => (await voicePlays(book)).at(-1)).toBe('p1tl');

  // 5. Switch to English in the toolbar menu: English from then on.
  await voiceBtn.click();
  await book.getByRole('radio', { name: 'English' }).click();
  await expect(
    book.getByRole('button', { name: 'Voiceover: English. Change language' }),
  ).toBeVisible();
  await book.keyboard.press('ArrowRight');
  await expect(book.locator('.fp-indicator')).toHaveText('2 / 4');
  await book.waitForTimeout(700); // let the turn finish (a key mid-turn only finishes it)
  await book.keyboard.press('ArrowRight');
  await expect(book.locator('.fp-indicator')).toHaveText('3 / 4');
  await expect.poll(async () => (await voicePlays(book)).at(-1)).toBe('p3en');

  // 6. A tap line that also turns the page finishes; the new page's voice follows it.
  await book.locator('.fp-page:not([aria-hidden]) .fl-button').click();
  await expect(book.locator('.fp-indicator')).toHaveText('4 / 4');
  await expect.poll(async () => (await voicePlays(book)).at(-1)).toBe('goEn');
  await book.waitForTimeout(300);
  expect((await voicePlays(book)).at(-1)).toBe('goEn');
  await endLine(book);
  await expect.poll(async () => (await voicePlays(book)).at(-1)).toBe('p4en');

  // 7. Effects and voice are separate: effects off keeps the voice, voice off keeps effects.
  expect(await effectPlays(book)).toContain('swoosh');
  await book.getByRole('button', { name: 'Mute sound effects' }).click();
  const effectsBefore = (await effectPlays(book)).length;
  await book.keyboard.press('ArrowLeft');
  await expect(book.locator('.fp-indicator')).toHaveText('3 / 4');
  await book.waitForTimeout(700);
  await book.keyboard.press('ArrowRight');
  await expect(book.locator('.fp-indicator')).toHaveText('4 / 4');
  await expect.poll(async () => (await voicePlays(book)).at(-1)).toBe('p4en');
  expect(await effectPlays(book)).toHaveLength(effectsBefore);
  await book.getByRole('button', { name: 'Unmute sound effects' }).click();
  await book.keyboard.press('v');
  await expect(book.getByRole('button', { name: 'Voiceover off. Change language' })).toBeVisible();
  const voiceBefore = (await voicePlays(book)).length;
  await book.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await effectPlays(book)).length).toBe(effectsBefore + 1);
  expect(await voicePlays(book)).toHaveLength(voiceBefore);
  await book.keyboard.press('v'); // back to English

  // 8. Reopening: the choice is remembered; no card, a "Tap to listen" pill instead.
  await book.reload();
  await expect(book.getByRole('dialog', { name: 'Listen book' })).toHaveCount(0);
  const pill = book.getByRole('button', { name: 'Tap to listen' });
  await expect(pill).toBeVisible();
  expect(await voicePlays(book)).toEqual([]);
  await pill.click();
  // The book continues where the reader stopped (page 3), in the remembered language.
  await expect(book.locator('.fp-indicator')).toHaveText('3 / 4');
  await expect.poll(() => voicePlays(book)).toEqual(['p3en']);

  expect(requests.filter((u) => !/^(file|data|blob):/.test(u))).toEqual([]);
  expect(errors).toEqual([]);
  await context.close();
});

test('Read to me turns after each clip, and waits at a choice, a locked page and for the reader', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await createBlankBook(page, 'Read to me');
  await insertText(page, 'Page one');
  for (const text of ['Page two', 'Page three', 'Page four']) {
    await page.getByRole('button', { name: 'Add page', exact: true }).first().click();
    await insertText(page, text);
  }
  await addLanguages(page, ['English']);
  for (const [n, clip] of [
    [1, CLIPS.p1en],
    [2, CLIPS.p2en],
    [3, CLIPS.p3en],
    [4, CLIPS.p4en],
  ] as const) {
    await thumb(page, n).click();
    await audioTab(page);
    await uploadVoiceClip(
      page,
      new RegExp(`Upload English voiceover for page ${n}$`),
      clip,
      `p${n}.wav`,
    );
  }
  // Page 2 is a choice; page 3 waits for a tap.
  await thumb(page, 2).click();
  await page
    .getByRole('toolbar', { name: 'Insert' })
    .getByRole('button', { name: 'Button' })
    .click();
  await page.getByRole('menuitem', { name: /Choice/ }).click();
  await thumb(page, 3).click();
  await clickEmpty(page);
  await page.getByRole('tab', { name: 'Interact' }).click();
  await page.getByRole('switch', { name: /Tap something to continue/ }).click();
  await waitForSaved(page);
  const file = await exportBook(page, 'read-to-me.html');

  const context = await browser.newContext();
  await context.addInitScript(PLAY_SPY);
  const book = await context.newPage();
  await book.goto(pathToFileURL(file).href);
  await book
    .getByRole('dialog', { name: 'Read to me' })
    .getByRole('button', { name: 'English' })
    .click();
  await expect.poll(() => voicePlays(book)).toEqual(['p1en']);
  await book.getByRole('button', { name: /Voiceover: English/ }).click();
  await book.getByRole('switch', { name: 'Turn pages for me' }).click();
  await expect(book.getByRole('switch', { name: 'Turn pages for me' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await book.keyboard.press('Escape');
  const indicator = book.locator('.fp-indicator');

  // The reader doing something (here, a key) puts off the turn.
  await endLine(book);
  await book.keyboard.press('Shift');
  await book.waitForTimeout(1500);
  await expect(indicator).toHaveText('1 / 4');

  // Once the clip ends (Listen again, then it finishes), the page turns by itself.
  await book.getByRole('button', { name: /Voiceover: English/ }).click();
  await book.getByRole('button', { name: 'Listen again' }).click();
  await endLine(book);
  await expect(indicator).toHaveText('2 / 4', { timeout: 4000 });
  await expect.poll(async () => (await voicePlays(book)).at(-1)).toBe('p2en');

  // A choice: it waits.
  await endLine(book);
  await book.waitForTimeout(1600);
  await expect(indicator).toHaveText('2 / 4');
  // "Option A" goes to page 3, which waits for a tap: Read to me waits too.
  await book.locator('.fp-page:not([aria-hidden]) .fl-button').first().click();
  await expect(indicator).toHaveText('3 / 4');
  await expect.poll(async () => (await voicePlays(book)).at(-1)).toBe('p3en');
  await endLine(book);
  await book.waitForTimeout(1600);
  await expect(indicator).toHaveText('3 / 4');
  await context.close();
});
