import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { waitForSaved } from './helpers';

const TITLE = "Pip's Big Day (sample)";

async function download(page: Page, format: 'HTML' | 'ZIP', name: string) {
  await page.getByRole('button', { name: 'Export' }).click();
  if (format === 'ZIP') await page.getByRole('radio', { name: /ZIP folder/ }).click();
  else await page.getByRole('radio', { name: /Single HTML file/ }).click();
  await expect(page.getByTestId('export-estimate')).toContainText('Estimated size');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: `Download ${format}` }).click(),
  ]);
  const file = test.info().outputPath(name);
  await dl.saveAs(file);
  await page.keyboard.press('Escape');
  return file;
}

const bookCards = (page: Page) => page.getByRole('button', { name: /^More actions for / });

async function importFile(page: Page, file: string) {
  await page.getByTestId('import-input').setInputFiles(file);
  return page.getByTestId('import-dialog');
}

test('an exported book imports back as an editable book (HTML, ZIP, keep both, replace)', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample book' }).click();
  await expect(page.getByTestId('page-item')).toHaveCount(6, { timeout: 20_000 });

  // Hide one star: hidden pictures must survive the round trip too.
  await page.getByRole('button', { name: 'Page 5', exact: true }).click();
  await page.getByRole('tab', { name: 'Layers' }).click();
  await page.getByRole('button', { name: 'Hide Star 3' }).click();
  await waitForSaved(page);

  const html = await download(page, 'HTML', 'pip.html');
  const zip = await download(page, 'ZIP', 'pip.zip');

  // Start over with an empty dashboard.
  await page.goto('/');
  await bookCards(page).first().click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Make your first book')).toBeVisible();

  // Nothing leaves the app while importing.
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));

  // 1. Import the single HTML file.
  let dialog = await importFile(page, html);
  await expect(dialog.getByRole('heading', { name: `Import “${TITLE}”?` })).toBeVisible();
  await expect(dialog).toContainText('6 pages');
  await expect(dialog.getByRole('alert')).toHaveCount(0); // nothing missing
  await expect(dialog.getByTestId('import-cover').locator('.fl-page')).toBeVisible();
  await dialog.getByRole('button', { name: 'Import book' }).click();

  await expect(page.getByTestId('page-item')).toHaveCount(6);
  await expect(page.locator('.fl-mode-editor .fl-el[data-character-id]')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Interact' }).click();
  await expect(page.getByText('No problems found.')).toBeVisible();
  // Sounds and poses came back as real, editable files.
  await expect(page.getByRole('list', { name: 'Sounds' }).getByRole('listitem')).toHaveCount(1);
  await page.locator('.fl-mode-editor .fl-el[data-character-id]').click();
  await page.getByRole('tab', { name: 'Design' }).click();
  await expect(page.getByRole('list', { name: 'Poses' }).getByRole('listitem')).toHaveCount(1);

  // The hidden star is still there, with its picture.
  await page.getByRole('button', { name: 'Page 5', exact: true }).click();
  await page.getByRole('tab', { name: 'Layers' }).click();
  await page.getByRole('button', { name: 'Show Star 3' }).click();
  const stars = page.locator('.fl-mode-editor .fl-el[data-type=image] img[alt="A star"]');
  await expect(stars).toHaveCount(3);
  await expect
    .poll(() =>
      stars.evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).naturalWidth > 0)),
    )
    .toBe(true);

  // It edits and saves like any book.
  await page.getByRole('button', { name: 'Page 1', exact: true }).click();
  await page.getByRole('toolbar', { name: 'Insert' }).getByRole('button', { name: 'Text' }).click();
  await page.keyboard.type('Edited after import');
  await page.keyboard.press('Escape');
  await waitForSaved(page);
  await page.reload();
  await expect(page.locator('.fl-mode-editor')).toContainText('Edited after import');

  // 2. The ZIP of the same book: it's already here → "Keep both" (the default) adds a copy.
  await page.goto('/');
  dialog = await importFile(page, zip);
  await expect(dialog.getByText('This book is already here')).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /Keep both/ })).toBeChecked();
  await dialog.getByRole('button', { name: 'Import book' }).click();
  await expect(page.getByTestId('page-item')).toHaveCount(6);
  await page.goto('/');
  await expect(bookCards(page)).toHaveCount(2);
  await expect(page.getByText(`${TITLE} (imported)`)).toBeVisible();

  // 3. Replace: warns that the copy here has newer edits, then restores the file's version.
  dialog = await importFile(page, html);
  await dialog.getByRole('radio', { name: /Replace my copy/ }).click();
  await expect(dialog.getByRole('alert')).toContainText('changed after this file was exported');
  await dialog.getByRole('button', { name: 'Replace my copy' }).click();
  await expect(page.getByTestId('page-item')).toHaveCount(6);
  await expect(page.locator('.fl-mode-editor .fl-el[data-type=text]').first()).toBeVisible();
  await expect(page.locator('.fl-mode-editor')).not.toContainText('Edited after import');
  await page.goto('/');
  await expect(bookCards(page)).toHaveCount(2);

  const outside = requests.filter((u) => !u.startsWith(baseURL!) && !/^(data|blob):/.test(u));
  expect(outside).toEqual([]);
});

test('files that are not Folio books get a clear message and import nothing', async ({ page }) => {
  const path = test.info().outputPath('not-a-book.html');
  await writeFile(path, '<!doctype html><title>Hi</title><p>Just a page</p>');
  await page.goto('/');
  const dialog = await importFile(page, path);
  await expect(dialog.getByRole('heading', { name: 'Couldn’t import this file' })).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('not a book exported by Folio');
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByText('Make your first book')).toBeVisible();
});

test('dropping an exported book on the dashboard imports it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample book' }).click();
  await expect(page.getByTestId('page-item')).toHaveCount(6, { timeout: 20_000 });
  const file = await download(page, 'HTML', 'drop.html');
  await page.goto('/');
  const bytes = [...(await readFile(file))];
  const drop = await page.evaluateHandle((data) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(data)], 'drop.html', { type: 'text/html' }));
    return dt;
  }, bytes);
  const target = page.getByRole('main');
  await target.dispatchEvent('dragover', { dataTransfer: drop });
  await expect(page.getByText('Drop a book exported by Folio to import it')).toBeVisible();
  await target.dispatchEvent('drop', { dataTransfer: drop });
  const dialog = page.getByTestId('import-dialog');
  await expect(dialog.getByText('This book is already here')).toBeVisible();
  await dialog.getByRole('button', { name: 'Import book' }).click();
  await expect(page.getByTestId('page-item')).toHaveCount(6);
});
