import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  addLanguages,
  createBlankBook,
  insertText,
  makeWav,
  uploadVoiceClip,
  waitForSaved,
} from './helpers';

const CALM = makeWav(900, 4);
const FAST = makeWav(700, 1.5);
const VOICE = makeWav(300);

const SPY = () => {
  const w = window as unknown as { __plays: { src: string; kind: string }[] };
  w.__plays = [];
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    w.__plays.push({ src: this.src || this.currentSrc, kind: this.dataset.folio ?? 'effect' });
    return Promise.resolve();
  };
};
const musicPlays = async (page: Page) =>
  (
    await page.evaluate(
      () => (window as unknown as { __plays: { src: string; kind: string }[] }).__plays,
    )
  )
    .filter((p) => p.kind === 'music' && !p.src.startsWith('data:audio/wav;base64,UklGRiQAAAB'))
    .map((p) =>
      p.src.endsWith(CALM.toString('base64'))
        ? 'calm'
        : p.src.endsWith(FAST.toString('base64'))
          ? 'fast'
          : '?',
    );
type Debug = { music: { trackId: string | null; level: number; gain: number } | null };
const music = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { folioPlayer: { debugAudio(): Debug } }).folioPlayer.debugAudio()
        .music!,
  );
const thumb = (page: Page, n: number) =>
  page.getByRole('button', { name: `Page ${n}`, exact: true });
const endLine = (page: Page) =>
  page.evaluate(() =>
    document.querySelector('audio[data-folio=voice]')!.dispatchEvent(new Event('ended')),
  );

test('background music: sections, crossfade, ducking under the voice, reader controls remembered', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await createBlankBook(page, 'Music book');
  await insertText(page, 'One');
  for (const text of ['Two', 'Three']) {
    await page.getByRole('button', { name: 'Add page', exact: true }).first().click();
    await insertText(page, text);
  }
  await addLanguages(page, ['English']);
  await thumb(page, 2).click();
  await page.getByTestId('stage-page').click({ position: { x: 4, y: 4 } });
  await page.getByRole('tab', { name: 'Audio' }).click();
  await uploadVoiceClip(page, /Upload English voiceover for page 2$/, VOICE, 'p2.wav');

  // Two tracks; calm from page 1, fast from page 2, stop on page 3.
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Upload music' }).click(),
  ]);
  await chooser.setFiles([
    { name: 'calm.wav', mimeType: 'audio/wav', buffer: CALM },
    { name: 'fast.wav', mimeType: 'audio/wav', buffer: FAST },
  ]);
  await expect(page.getByRole('list', { name: 'Music tracks' }).getByRole('listitem')).toHaveCount(
    2,
  );
  const pick = async (n: number, option: string) => {
    await thumb(page, n).click();
    await page.getByTestId('stage-page').click({ position: { x: 4, y: 4 } });
    await page.getByRole('combobox', { name: 'Music from this page' }).click();
    await page.getByRole('option', { name: option }).click();
  };
  await pick(1, 'calm');
  await pick(2, 'fast');
  await pick(3, 'Stop the music');
  await expect(
    page.getByRole('navigation', { name: 'Pages' }).getByLabel('Music changes here'),
  ).toHaveCount(3);
  await waitForSaved(page);

  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByTestId('export-estimate')).toContainText('music');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download HTML' }).click(),
  ]);
  const file = test.info().outputPath('music.html');
  await dl.saveAs(file);

  const context = await browser.newContext();
  await context.addInitScript(SPY);
  const requests: string[] = [];
  context.on('request', (r) => requests.push(r.url()));
  const book = await context.newPage();
  await book.goto(pathToFileURL(file).href);
  await book.waitForTimeout(400);
  expect(await musicPlays(book)).toEqual([]);
  await book
    .getByRole('dialog', { name: 'Music book' })
    .getByRole('button', { name: 'English' })
    .click();
  await expect.poll(() => musicPlays(book)).toEqual(['calm']);
  expect((await music(book)).trackId).toMatch(/^mu_/);
  const calmId = (await music(book)).trackId;

  // Page 2: crossfade to the fast track; the voice speaks, so the music ducks.
  await book.keyboard.press('ArrowRight');
  await expect(book.locator('.fp-indicator')).toHaveText('2 / 3');
  await expect.poll(() => musicPlays(book)).toEqual(['calm', 'fast']);
  await expect.poll(async () => (await music(book)).trackId).not.toBe(calmId);
  await expect.poll(async () => (await music(book)).level).toBeCloseTo(1 / 3, 2);
  await endLine(book);
  await expect.poll(async () => (await music(book)).level).toBeCloseTo(1, 2);

  // Page 3 stops the music; going back brings the fast track again.
  await book.waitForTimeout(700);
  await book.keyboard.press('ArrowRight');
  await expect(book.locator('.fp-indicator')).toHaveText('3 / 3');
  await expect.poll(async () => (await music(book)).trackId).toBeNull();
  await book.waitForTimeout(700);
  await book.keyboard.press('ArrowLeft');
  await expect(book.locator('.fp-indicator')).toHaveText('2 / 3');
  await expect.poll(async () => (await music(book)).trackId).not.toBeNull();

  // Reader controls: music off, then remembered after a reload.
  await book.getByRole('button', { name: /Voiceover: English/ }).click();
  await book.getByRole('switch', { name: 'Music' }).click();
  await expect.poll(async () => (await music(book)).level).toBe(0);
  await book.keyboard.press('Escape');
  await book.reload();
  await book.getByRole('button', { name: 'Tap to listen' }).click();
  await expect.poll(async () => (await music(book)).level).toBe(0);
  await book.keyboard.press('b'); // B turns the music back on
  await expect.poll(async () => (await music(book)).level).toBeCloseTo(1, 2);
  await book.getByRole('button', { name: /Voiceover: English/ }).click();
  await book.getByRole('slider', { name: 'Music volume' }).fill('40');
  await expect.poll(async () => (await music(book)).level).toBeCloseTo(0.4, 2);
  await book.reload();
  await book.getByRole('button', { name: 'Tap to listen' }).click();
  await expect.poll(async () => (await music(book)).level).toBeCloseTo(0.4, 2);

  expect(requests.filter((u) => !/^(file|data|blob):/.test(u))).toEqual([]);
  await context.close();
});
