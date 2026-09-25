import { pathToFileURL } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createBlankBook, insertShape, makeWav, stageElements, waitForSaved } from './helpers';

const POP = makeWav(300, 2);
const DING = makeWav(400, 5);

/** Records every play() with its time, instead of relying on audio output. */
const TIMED_SPY = () => {
  const w = window as unknown as { __plays: number[] };
  w.__plays = [];
  HTMLMediaElement.prototype.play = function () {
    w.__plays.push(performance.now());
    return Promise.resolve();
  };
};
const plays = (page: Page) =>
  page.evaluate(() => (window as unknown as { __plays: number[] }).__plays);

async function pickUpload(page: Page, button: RegExp, file: Buffer, name: string) {
  await page.getByRole('button', { name: button }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: 'Upload a sound…' }).click(),
  ]);
  await chooser.setFiles({ name, mimeType: 'audio/wav', buffer: file });
}

const startOf = async (bar: Locator) =>
  Number(/starts ([\d.]+) s/.exec((await bar.getAttribute('aria-label')) ?? '')?.[1]);
const lengthOf = async (bar: Locator) =>
  Number(/([\d.]+) s long/.exec((await bar.getAttribute('aria-label')) ?? '')?.[1]);

/** Drags from a point in `target` by dx (Shift held: no snapping). */
async function drag(page: Page, target: Locator, dx: number, at?: { x?: number; y?: number }) {
  await target.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
  const box = (await target.boundingBox())!;
  const x = box.x + (at?.x ?? box.width / 2);
  const y = box.y + (at?.y ?? box.height / 2);
  await page.keyboard.down('Shift');
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(x + (dx * i) / 6, y);
  await page.mouse.up();
  await page.keyboard.up('Shift');
}

test('audio in the timeline: drag, trim and fade clips; Play starts them when the book does', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await page.addInitScript(TIMED_SPY);
  await createBlankBook(page, 'Timeline audio');
  await insertShape(page, 'Rectangle');
  await page.getByRole('tab', { name: 'Animate' }).click();
  await page.getByRole('button', { name: /Add animation/ }).click();
  await page.getByRole('menuitem', { name: 'Pop in' }).click();
  const delay = page.getByLabel('Delay');
  await delay.fill('0.8');
  await delay.press('Enter');

  // A pop as it appears, and a ding at 1.5 s.
  await page.getByRole('tab', { name: 'Design' }).click();
  await pickUpload(page, /^Add sound$/, POP, 'pop.wav');
  await page.getByRole('button', { name: 'Open timeline' }).click();
  const playhead = page.getByLabel('Playhead time');
  await playhead.fill('1.5');
  await playhead.press('Enter');
  await stageElements(page, 'shape').click({ force: true });
  await pickUpload(page, /Sound at the playhead/, DING, 'ding.wav');

  const bars = page.getByTestId('audio-bar');
  await expect(bars).toHaveCount(2);
  await expect(page.getByTestId('audio-lane')).toHaveCount(1); // both on the Rectangle's lane
  await page.getByLabel('Timeline zoom').fill('0.4');
  const ding = bars.nth(1);
  await expect(ding).toHaveAttribute('aria-label', /^ding, sound, starts 1\.50 s/);
  expect(await lengthOf(ding)).toBeCloseTo(0.4, 1);

  // Drag it 0.5 s later (200 px at 0.4 px/ms); one undo puts it back.
  // Grab the body below the volume line.
  await drag(page, ding, 200, { y: 18 });
  await expect.poll(() => startOf(ding)).toBeCloseTo(2, 1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => startOf(ding)).toBe(1.5);

  // Trim its end by 0.1 s: shorter, same start.
  await drag(page, ding.locator('[data-handle=trimEnd]'), -40);
  await expect.poll(() => lengthOf(ding)).toBeCloseTo(0.3, 1);
  expect(await startOf(ding)).toBe(1.5);

  // Fade in: the handle moves right.
  await drag(page, ding.locator('[data-handle=fadeIn]'), 30);
  await expect.poll(async () => Number(await ding.getAttribute('data-fade-in'))).toBeGreaterThan(0);

  // Keyboard: a volume step down.
  await ding.focus();
  await page.keyboard.press('-');
  await expect(ding).toHaveAttribute('aria-label', /volume 95 %/);

  // Play from the start: the pop at 0.8 s, the ding at 1.5 s.
  await page.getByRole('button', { name: 'Stop' }).click();
  await page.evaluate(() => ((window as unknown as { __plays: number[] }).__plays = []));
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const t0 = await page.evaluate(() => performance.now());
  await expect.poll(async () => (await plays(page)).length, { timeout: 5000 }).toBe(2);
  const editor = (await plays(page)).map((t) => t - t0);
  expect(Math.abs(editor[0]! - 800)).toBeLessThan(150);
  expect(Math.abs(editor[1]! - 1500)).toBeLessThan(150);

  // The exported book plays them at the same moments.
  await page.getByTitle('Timeline (T)').click();
  await waitForSaved(page);
  await page.getByRole('button', { name: 'Export' }).click();
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download HTML' }).click(),
  ]);
  const file = test.info().outputPath('timeline-audio.html');
  await dl.saveAs(file);
  const context = await browser.newContext();
  await context.addInitScript(TIMED_SPY);
  const book = await context.newPage();
  await book.goto(pathToFileURL(file).href);
  await book.getByRole('button', { name: 'Tap to start' }).click();
  const b0 = await book.evaluate(() => performance.now());
  await expect.poll(async () => (await plays(book)).length).toBe(2);
  const exported = (await plays(book)).map((t) => t - b0);
  for (let i = 0; i < 2; i++) expect(Math.abs(exported[i]! - editor[i]!)).toBeLessThan(150);
  await context.close();
});
