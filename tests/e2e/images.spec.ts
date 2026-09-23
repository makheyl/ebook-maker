import { expect, test } from '@playwright/test';
import { createBlankBook, makePng, stageElements } from './helpers';

async function assetCount(page: import('@playwright/test').Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open('folio');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction('assets', 'readonly');
          const count = tx.objectStore('assets').count();
          count.onsuccess = () => resolve(count.result);
          count.onerror = () => reject(count.error);
        };
      }),
  );
}

test('upload pipeline deduplicates identical files', async ({ page }) => {
  await createBlankBook(page, 'Images');
  const png = await makePng(page, '#ff6b6b', 300, 200);
  const input = page.getByTestId('insert-image-input');
  await input.setInputFiles({ name: 'red.png', mimeType: 'image/png', buffer: png });
  await expect(stageElements(page, 'image')).toHaveCount(1);
  await input.setInputFiles({ name: 'red-again.png', mimeType: 'image/png', buffer: png });
  await expect(stageElements(page, 'image')).toHaveCount(2);
  expect(await assetCount(page)).toBe(1);

  const other = await makePng(page, '#3aa0ff', 300, 200);
  await input.setInputFiles({ name: 'blue.png', mimeType: 'image/png', buffer: other });
  await expect(stageElements(page, 'image')).toHaveCount(3);
  expect(await assetCount(page)).toBe(2);
});

test('filters, crop, flip and reset are non-destructive', async ({ page }) => {
  await createBlankBook(page, 'Image tools');
  const png = await makePng(page, '#4cc38a', 400, 200);
  await page.getByTestId('insert-image-input').setInputFiles({ name: 'green.png', mimeType: 'image/png', buffer: png });
  const img = stageElements(page, 'image').locator('img');
  await expect(img).toHaveCount(1);
  const src = await img.getAttribute('src');

  await page.getByRole('radio', { name: 'B&W' }).click();
  await expect(img).toHaveCSS('filter', /grayscale\(1\)/);

  await page.getByRole('button', { name: 'Flip H' }).click();
  await expect(stageElements(page, 'image').locator('.fl-image-flip')).toHaveAttribute('style', /scale\(-1, 1\)/);

  await page.getByRole('button', { name: 'Crop' }).click();
  await page.getByRole('radio', { name: '1:1' }).click();
  await page.getByRole('button', { name: 'Apply' }).click();
  const w = Number(await page.getByLabel('Width').inputValue());
  const h = Number(await page.getByLabel('Height').inputValue());
  expect(Math.abs(w - h)).toBeLessThanOrEqual(1);

  // The original bitmap is untouched: same source, only CSS changes.
  await expect(img).toHaveAttribute('src', src!);

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(img).not.toHaveCSS('filter', /grayscale/);
});

test('image as page background', async ({ page }) => {
  await createBlankBook(page, 'Background');
  const png = await makePng(page, '#ffb84d', 200, 150);
  await page.getByTestId('background-image-input').setInputFiles({ name: 'bg.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('[data-testid=stage-page] .fl-bg-img')).toHaveCount(1);
});
