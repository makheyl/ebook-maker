import { pathToFileURL } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';

/** Presses → until the reader shows `text` (the first press may only finish animations). */
async function nextUntil(page: Page, reader: Locator, text: string) {
  await expect
    .poll(
      async () => {
        await page.keyboard.press('ArrowRight');
        return reader.locator('.fp-indicator').textContent();
      },
      { intervals: [400], timeout: 15_000 },
    )
    .toBe(text);
}

test('the sample book shows off a mascot, a choice, a flap, a star hunt and two endings', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample book' }).click();
  await expect(page.getByTestId('page-item')).toHaveCount(6, { timeout: 20_000 });
  await expect(page.locator('.fl-mode-editor .fl-el[data-character-id]')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Interact' }).click();
  await expect(page.getByText('No problems found.')).toBeVisible();

  await page.getByRole('banner').getByRole('button', { name: 'Preview' }).click();
  const reader = page.getByTestId('preview');
  const indicator = reader.locator('.fp-indicator');
  await expect(indicator).toHaveText('1 / 6');
  await nextUntil(page, reader, '2 / 6');
  await nextUntil(page, reader, '3 / 6');

  // The sea path: the star hunt keeps the page locked until all three are found.
  await reader.getByRole('button', { name: 'Down to the sea' }).click();
  await expect(indicator).toHaveText('5 / 6');
  await expect(reader.locator('.fp-goal')).toContainText('0 / 3');
  await page.keyboard.press('ArrowRight');
  await expect(indicator).toHaveText('5 / 6');
  for (const n of [1, 2, 3]) {
    const star = reader.getByRole('button', { name: `Star ${n}` });
    await star.focus();
    await page.keyboard.press('Enter');
    await expect(reader.locator('.fp-goal')).toContainText(`${n} / 3`);
  }
  await nextUntil(page, reader, '6 / 6');
  const end = reader.getByRole('dialog', { name: 'The End' });
  await expect
    .poll(
      async () => {
        await page.keyboard.press('ArrowRight');
        return end.isVisible();
      },
      { intervals: [400], timeout: 10_000 },
    )
    .toBe(true);

  // The forest path: lift the flap, then the forest leads straight to the night.
  await reader.getByRole('button', { name: 'Read again' }).click();
  await nextUntil(page, reader, '2 / 6');
  await nextUntil(page, reader, '3 / 6');
  await reader.getByRole('button', { name: 'Into the forest' }).click();
  await expect(indicator).toHaveText('4 / 6');
  // The forest's paragraph is justified.
  await expect(
    reader.locator('.fp-page:not([aria-hidden]) [style*="text-align: justify"]'),
  ).not.toHaveCount(0);
  const owl = reader.locator('.fp-page:not([aria-hidden]) .fl-el[data-type=image]').filter({
    has: page.locator('img[alt="An owl"]'),
  });
  const owlOpacity = () =>
    owl.locator('.fl-anim').evaluate((el) => Number(getComputedStyle(el).opacity));
  expect(await owlOpacity()).toBe(0);
  await reader.getByRole('button', { name: 'Lift the flap: who is there?' }).click();
  await expect.poll(owlOpacity).toBe(1);
  await nextUntil(page, reader, '6 / 6');
  await page.keyboard.press('Escape');

  // Exported, it works offline.
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByTestId('export-estimate')).toContainText('sounds');
  await expect(page.getByTestId('export-estimate')).toContainText('music');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download HTML' }).click(),
  ]);
  const file = test.info().outputPath('sample.html');
  await dl.saveAs(file);
  const context = await browser.newContext();
  const requests: string[] = [];
  context.on('request', (r) => requests.push(r.url()));
  const book = await context.newPage();
  const errors: string[] = [];
  book.on('pageerror', (e) => errors.push(e.message));
  book.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await book.goto(pathToFileURL(file).href);
  await expect(book.locator('.fp-indicator')).toHaveText('1 / 6');
  await expect(book.locator('.fp-page:not([aria-hidden]) .fl-el[data-character-id]')).toHaveCount(
    1,
  );

  // Soft music starts with the reader's first tap; it can be turned off.
  const musicTrack = () =>
    book.evaluate(
      () =>
        (
          window as unknown as {
            folioPlayer: { debugAudio(): { music: { trackId: string | null; level: number } } };
          }
        ).folioPlayer.debugAudio().music,
    );
  await book.getByRole('button', { name: 'Tap to start' }).click();
  await expect.poll(async () => (await musicTrack()).trackId).toMatch(/^mu_/);
  await book.getByRole('button', { name: /^Audio: music on/ }).click();
  await book.getByRole('switch', { name: 'Music' }).click();
  await expect.poll(async () => (await musicTrack()).level).toBe(0);

  expect(requests.filter((u) => !/^(file|data|blob):/.test(u))).toEqual([]);
  expect(errors).toEqual([]);
  await context.close();
});
