import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { createBlankBook, insertShape, makeWav, stageElements, waitForSaved } from './helpers';

const POP = makeWav(300, 2);
const DING = makeWav(400, 5);

/** Records every play() with its time, instead of relying on audio output. */
const TIMED_SPY = () => {
  const w = window as unknown as { __plays: { src: string; t: number }[] };
  w.__plays = [];
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    w.__plays.push({ src: this.src || this.currentSrc, t: performance.now() });
    return Promise.resolve();
  };
};
const plays = (page: Page) =>
  page.evaluate(() => (window as unknown as { __plays: { src: string; t: number }[] }).__plays);
const which = (src: string) =>
  src.endsWith(POP.toString('base64'))
    ? 'pop'
    : src.endsWith(DING.toString('base64'))
      ? 'ding'
      : '?';

async function pickUpload(page: Page, button: RegExp, file: Buffer, name: string) {
  await page.getByRole('button', { name: button }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: 'Upload a sound…' }).click(),
  ]);
  await chooser.setFiles({ name, mimeType: 'audio/wav', buffer: file });
}

test('an element’s sounds play when it appears, at a set time and when tapped — with their volume', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  await createBlankBook(page, 'Popping');
  await insertShape(page, 'Rectangle');
  await page.getByRole('tab', { name: 'Animate' }).click();
  await page.getByRole('button', { name: /Add animation/ }).click();
  await page.getByRole('menuitem', { name: 'Pop in' }).click();
  const delay = page.getByLabel('Delay');
  await delay.fill('0.8');
  await delay.press('Enter');

  // When it appears: a pop, with the entrance (0.8 s).
  await page.getByRole('tab', { name: 'Design' }).click();
  await pickUpload(page, /^Add sound$/, POP, 'pop.wav');
  await expect(page.getByTestId('audio-clip')).toHaveCount(1);
  await expect(page.getByTestId('audio-clip')).toContainText('as it appears');

  // At a set time: a ding at 1.5 s (placed at the timeline's playhead).
  await page.getByRole('button', { name: 'Open timeline' }).click();
  const playhead = page.getByLabel('Playhead time');
  await playhead.fill('1.5');
  await playhead.press('Enter');
  await stageElements(page, 'shape').click({ force: true });
  await pickUpload(page, /Sound at the playhead/, DING, 'ding.wav');
  await expect(page.getByTestId('audio-clip')).toHaveCount(2);
  await expect(page.getByTestId('audio-clip').nth(1)).toContainText('1.5 s');

  // When tapped: the pop again, at half volume.
  await page.getByRole('button', { name: 'Add tap sound' }).click();
  await page.getByRole('menuitem', { name: 'pop' }).click();
  await page.getByRole('button', { name: 'Adjust pop' }).last().click();
  const volume = page.getByRole('slider', { name: 'Volume' });
  await volume.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 5; i++) await page.keyboard.press('PageUp');
  await expect(page.getByText('50%')).toBeVisible();
  await page.keyboard.press('Escape');

  // The Audio tab lists everything.
  await page.getByTitle('Timeline (T)').click(); // close it: the page is roomier
  await page.getByTestId('stage-page').click({ position: { x: 4, y: 4 } });
  await page.getByRole('tab', { name: 'Audio' }).click();
  await expect(
    page.getByRole('list', { name: 'Audio on this page' }).getByRole('listitem'),
  ).toHaveCount(3);
  await page.getByRole('button', { name: 'Add page', exact: true }).first().click();
  await waitForSaved(page);

  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByTestId('export-estimate')).toContainText('Estimated size');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download HTML' }).click(),
  ]);
  const file = test.info().outputPath('popping.html');
  await dl.saveAs(file);

  const context = await browser.newContext();
  await context.addInitScript(TIMED_SPY);
  const book = await context.newPage();
  await book.goto(pathToFileURL(file).href);
  // Timed sounds wait for the reader's first tap.
  const start = book.getByRole('button', { name: 'Tap to start' });
  await expect(start).toBeVisible();
  await book.waitForTimeout(1000);
  expect(await plays(book)).toEqual([]);
  await start.click();
  const t0 = await book.evaluate(() => performance.now());
  await expect.poll(async () => (await plays(book)).length).toBe(2);
  const [first, second] = await plays(book);
  expect([which(first!.src), which(second!.src)]).toEqual(['pop', 'ding']);
  expect(Math.abs(first!.t - t0 - 800)).toBeLessThan(150);
  expect(Math.abs(second!.t - t0 - 1500)).toBeLessThan(150);

  // A tap plays the pop at 50 %.
  await book.locator('.fp-page:not([aria-hidden]) .fl-el[data-type=shape]').click();
  await expect.poll(async () => (await plays(book)).length).toBe(3);
  const gain = await book.evaluate(
    () =>
      (
        window as unknown as {
          folioPlayer: { debugAudio(): { effects: { gain: number; key: string }[] } };
        }
      ).folioPlayer
        .debugAudio()
        .effects.find((e) => e.key === '')?.gain,
  );
  expect(gain).toBeCloseTo(0.5, 2);

  // Going back to the page plays none of its timed sounds.
  await book.keyboard.press('ArrowRight');
  await expect(book.locator('.fp-indicator')).toHaveText('2 / 2');
  await book.waitForTimeout(700);
  const before = (await plays(book)).length;
  await book.keyboard.press('ArrowLeft');
  await expect(book.locator('.fp-indicator')).toHaveText('1 / 2');
  await book.waitForTimeout(1800);
  expect(await plays(book)).toHaveLength(before);
  await context.close();
});
