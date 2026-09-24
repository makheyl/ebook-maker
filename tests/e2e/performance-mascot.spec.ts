import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { makeMascotPng } from './helpers';

type PerfWindow = Window & {
  __longTasks: number[];
  folioPlayer: { goTo(i: number, d?: 1 | -1 | 0): void; pageIndex: number };
};

test('a 30-page mascot book turns pages in under 100 ms and idles without long tasks', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const verbs = ['jumped', 'walked', 'waved', 'danced', 'looked around', 'was sleepy'];
  const lines = Array.from(
    { length: 30 },
    (_, i) => `On day ${i + 1}, Pip ${verbs[i % verbs.length]}.`,
  );
  await page.goto('/#/new');
  await page.getByLabel('Title').fill('Thirty days of Pip');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Paste your text').fill(lines.join('\n'));
  await page.getByRole('button', { name: 'Add 30 lines' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page
    .getByTestId('wizard-character-input')
    .setInputFiles({ name: 'pip.png', mimeType: 'image/png', buffer: await makeMascotPng(page) });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: 'Words only' }).click();
  await page.getByRole('button', { name: 'Create 30-page book' }).click();
  await expect(page.getByText('30 pages')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByTestId('export-estimate')).toContainText('Estimated size');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download HTML' }).click(),
  ]);
  const file = test.info().outputPath('thirty.html');
  await dl.saveAs(file);

  const context = await browser.newContext();
  await context.addInitScript(() => {
    const w = window as unknown as PerfWindow;
    w.__longTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__longTasks.push(e.duration);
      }).observe({ type: 'longtask', buffered: false });
    } catch {
      // Long-task timing unsupported: the idle check below then passes trivially.
    }
  });
  const book = await context.newPage();
  await book.goto(pathToFileURL(file).href);
  await expect(book.locator('.fp-indicator')).toHaveText('1 / 30');
  await expect(book.locator('.fp-page:not([aria-hidden]) .fl-el[data-character-id]')).toHaveCount(
    1,
  );

  // Page turns: showing a page (mount, animations, style and layout) per turn.
  const turns = await book.evaluate(() => {
    const player = (window as unknown as PerfWindow).folioPlayer;
    const times: number[] = [];
    for (let i = 1; i < 30; i++) {
      const t = performance.now();
      player.goTo(i, 1);
      // Force style + layout of the new page so they count too.
      void document.querySelector('.fp-page:not([aria-hidden])')!.getBoundingClientRect();
      times.push(performance.now() - t);
    }
    return times;
  });
  expect(turns).toHaveLength(29);
  const sorted = [...turns].sort((a, b) => a - b);
  test.info().annotations.push({
    type: 'page turn ms',
    description: `median ${sorted[14]!.toFixed(1)}, max ${sorted[28]!.toFixed(1)}`,
  });
  expect(Math.max(...turns)).toBeLessThan(100);
  await expect(book.locator('.fp-indicator')).toHaveText('30 / 30');

  // Idle on a page with a breathing mascot: no main-thread task over 50 ms.
  await book.waitForTimeout(1500); // let the last turn settle
  await book.evaluate(() => ((window as unknown as PerfWindow).__longTasks = []));
  await book.waitForTimeout(3000);
  const longTasks = await book.evaluate(() => (window as unknown as PerfWindow).__longTasks);
  expect(longTasks.filter((d) => d > 50)).toEqual([]);
  expect(
    await book.evaluate(() =>
      document.getAnimations().some((a) => a.effect?.getTiming().iterations === Infinity),
    ),
  ).toBe(true); // the idle loop is running
  await context.close();
});
