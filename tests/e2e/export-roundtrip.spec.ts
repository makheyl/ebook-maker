import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Browser, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { createBlankBook, insertShape, insertText, makePng, stageElements } from './helpers';

async function addAnimation(page: Page, type: 'text' | 'shape', effect: string, start?: string) {
  await stageElements(page, type).first().click();
  await page.getByRole('tab', { name: 'Animate' }).click();
  await page.getByRole('button', { name: /Add animation/ }).click();
  await page.getByRole('menuitem', { name: effect, exact: true }).click();
  if (start) {
    await page.getByRole('combobox', { name: 'Start' }).click();
    await page.getByRole('option', { name: start }).click();
  }
  await page.getByRole('tab', { name: 'Design' }).click();
}

async function buildBook(page: Page) {
  await createBlankBook(page, 'Exported </script> Book');
  const png = await makePng(page, '#ff6b6b', 320, 240);
  await page.getByTestId('insert-image-input').setInputFiles({ name: 'red.png', mimeType: 'image/png', buffer: png });
  await expect(stageElements(page, 'image')).toHaveCount(1);
  await insertText(page, 'Hello export');
  await addAnimation(page, 'text', 'Fade in');
  await insertShape(page, 'Ellipse');
  await addAnimation(page, 'shape', 'Pop in', 'On click');
  await page.getByRole('button', { name: 'Add page', exact: true }).first().click();
  await insertText(page, 'Page two');
}

async function download(page: Page, format: 'HTML' | 'ZIP', file: string) {
  await page.getByRole('button', { name: 'Export' }).click();
  if (format === 'ZIP') await page.getByRole('radio', { name: /ZIP folder/ }).click();
  await expect(page.getByTestId('export-estimate')).toContainText('Estimated size');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: `Download ${format}` }).click(),
  ]);
  await dl.saveAs(file);
  return dl.suggestedFilename();
}

/** Opens a local file in a fresh context and records every request it makes. */
async function openOffline(browser: Browser, file: string) {
  const context = await browser.newContext();
  const requests: string[] = [];
  context.on('request', (r) => requests.push(r.url()));
  const reader = await context.newPage();
  const errors: string[] = [];
  reader.on('pageerror', (e) => errors.push(e.message));
  reader.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await reader.goto(pathToFileURL(file).href);
  return { reader, requests, errors, context };
}

async function assertBookWorks(reader: Page) {
  await expect(reader).toHaveTitle('Exported </script> Book');
  await expect(reader.locator('.fp-indicator')).toHaveText('1 / 2');
  const visible = reader.locator('.fp-page:not([aria-hidden])');
  await expect(visible).toContainText('Hello export');

  // Image decoded from the embedded asset.
  await expect
    .poll(() => visible.locator('.fl-img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true);

  // Page-enter animation runs; the on-click entrance waits for "next".
  const opacity = (type: string) =>
    visible.locator(`.fl-el[data-type=${type}] .fl-anim`).evaluate((el) => Number(getComputedStyle(el).opacity));
  await expect.poll(() => opacity('text')).toBe(1);
  expect(await opacity('shape')).toBe(0);
  await reader.keyboard.press('ArrowRight');
  await expect.poll(() => opacity('shape')).toBe(1);
  await expect.poll(() => reader.evaluate(() => document.getAnimations().every((a) => a.playState !== 'running'))).toBe(true);

  // Next page.
  await reader.keyboard.press('ArrowRight');
  await expect(reader.locator('.fp-indicator')).toHaveText('2 / 2');
  await expect(reader.locator('.fp-page:not([aria-hidden])')).toContainText('Page two');

  // Bundled font was embedded and used.
  expect(await reader.evaluate(() => document.fonts.check("16px 'Inter Variable'"))).toBe(true);
}

function expectNoNetwork(requests: string[]) {
  const remote = requests.filter((u) => !/^(file|data|blob):/.test(u));
  expect(remote, `unexpected network requests: ${remote.join(', ')}`).toEqual([]);
}

test('export round-trip: single HTML file works offline via file:// with zero network requests', async ({ page, browser }) => {
  await buildBook(page);
  const file = test.info().outputPath('book.html');
  const name = await download(page, 'HTML', file);
  expect(name).toMatch(/\.html$/);

  const html = await readFile(file, 'utf8');
  // No remote references (the SVG namespace string in the player is not a request).
  expect(html).not.toMatch(/(?:src|href)=["']?https?:|url\(["']?https?:/i);
  expect((html.match(/<script/g) ?? []).length).toBe(2);

  const { reader, requests, errors, context } = await openOffline(browser, file);
  await assertBookWorks(reader);
  expectNoNetwork(requests);
  expect(errors).toEqual([]);
  await context.close();
});

test('export round-trip: ZIP folder works offline via file://', async ({ page, browser }) => {
  await buildBook(page);
  const zipPath = test.info().outputPath('book.zip');
  await download(page, 'ZIP', zipPath);

  const dir = test.info().outputPath('unzipped');
  const zip = await JSZip.loadAsync(await readFile(zipPath));
  for (const [name, entry] of Object.entries(zip.files)) {
    const target = path.join(dir, name);
    if (entry.dir) await mkdir(target, { recursive: true });
    else {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, await entry.async('nodebuffer'));
    }
  }

  const { reader, requests, errors, context } = await openOffline(browser, path.join(dir, 'index.html'));
  await assertBookWorks(reader);
  expectNoNetwork(requests);
  expect(errors).toEqual([]);
  await context.close();
});
