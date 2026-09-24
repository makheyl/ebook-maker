import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { createBlankBook, insertText } from './helpers';

/** A short 8-bit mono WAV "ding", built in the test. */
function wav(ms = 250): Buffer {
  const rate = 8000;
  const n = Math.round((rate * ms) / 1000);
  const buf = Buffer.alloc(44 + n);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate, 28);
  buf.writeUInt16LE(1, 32);
  buf.writeUInt16LE(8, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) buf[44 + i] = 128 + Math.round(60 * Math.sin(i / 3));
  return buf;
}

const clickEmpty = (page: Page) =>
  page.getByTestId('stage-page').click({ position: { x: 8, y: 8 } });

/** Records every media play() call instead of relying on audio output. */
const PLAY_SPY = () => {
  const w = window as unknown as { __plays: string[] };
  w.__plays = [];
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    w.__plays.push(this.currentSrc || this.src);
    return Promise.resolve();
  };
};

test('sounds: nothing before the first gesture, taps and page turns play, mute is remembered', async ({
  page,
  browser,
}) => {
  await createBlankBook(page, 'Ding dong');
  await page.getByRole('button', { name: 'Add page', exact: true }).first().click();
  await insertText(page, 'Page two');
  await page.getByRole('button', { name: 'Page 1', exact: true }).click();

  // A "Tap me!" button whose action is a sound; the first sound is uploaded on the spot.
  await page
    .getByRole('toolbar', { name: 'Insert' })
    .getByRole('button', { name: 'Button' })
    .click();
  await page.getByRole('menuitem', { name: /Tap me!/ }).click();
  await page.getByRole('tab', { name: 'Interact' }).click();
  await page.getByRole('combobox', { name: 'Action 1' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('option', { name: 'Play a sound' }).click(),
  ]);
  await chooser.setFiles({ name: 'ding.wav', mimeType: 'audio/wav', buffer: wav() });
  await expect(page.getByRole('combobox', { name: 'Sound to play' })).toHaveText('ding');

  // The same sound when a page turns.
  await clickEmpty(page);
  await expect(page.getByRole('list', { name: 'Sounds' }).getByRole('listitem')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Page-turn sound' }).click();
  await page.getByRole('option', { name: 'ding' }).click();
  await expect(page.getByText('No problems found.')).toBeVisible();

  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByTestId('export-estimate')).toContainText('sounds');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download HTML' }).click(),
  ]);
  const file = test.info().outputPath('ding.html');
  await dl.saveAs(file);

  const context = await browser.newContext();
  await context.addInitScript(PLAY_SPY);
  const requests: string[] = [];
  context.on('request', (r) => requests.push(r.url()));
  const book = await context.newPage();
  const errors: string[] = [];
  book.on('pageerror', (e) => errors.push(e.message));
  book.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await book.goto(pathToFileURL(file).href);
  const plays = () => book.evaluate(() => (window as unknown as { __plays: string[] }).__plays);
  const indicator = book.locator('.fp-indicator');
  await expect(indicator).toHaveText('1 / 2');

  // Nothing plays on its own.
  await book.waitForTimeout(600);
  expect(await plays()).toEqual([]);

  await book.getByRole('button', { name: 'Tap me!' }).click();
  await expect.poll(async () => (await plays()).length).toBe(1);
  expect((await plays())[0]).toMatch(/^data:audio\/wav;base64,/);
  await expect(indicator).toHaveText('1 / 2');

  await book.keyboard.press('ArrowRight');
  await expect(indicator).toHaveText('2 / 2');
  await expect.poll(async () => (await plays()).length).toBe(2); // page-turn sound

  const mute = book.getByRole('button', { name: 'Mute sounds' });
  await mute.click();
  await expect(book.getByRole('button', { name: 'Unmute sounds' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await book.keyboard.press('ArrowLeft');
  await expect(indicator).toHaveText('1 / 2');
  await book.getByRole('button', { name: 'Tap me!' }).click();
  await book.waitForTimeout(300);
  expect(await plays()).toHaveLength(2);

  // Mute survives reopening the book.
  await book.reload();
  await expect(indicator).toHaveText('1 / 2');
  await expect(book.getByRole('button', { name: 'Unmute sounds' })).toBeVisible();
  await book.getByRole('button', { name: 'Tap me!' }).click();
  await book.waitForTimeout(300);
  expect(await plays()).toEqual([]);
  await book.getByRole('button', { name: 'Unmute sounds' }).click();
  await book.getByRole('button', { name: 'Tap me!' }).click();
  await expect.poll(async () => (await plays()).length).toBe(1);

  expect(requests.filter((u) => !/^(file|data|blob):/.test(u))).toEqual([]);
  expect(errors).toEqual([]);
  await context.close();
});
