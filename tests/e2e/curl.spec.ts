import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { createBlankBook, insertText } from './helpers';

const pageThumb = (page: Page, n: number) =>
  page.getByRole('button', { name: `Page ${n}`, exact: true });
const clickEmpty = (page: Page) =>
  page.getByTestId('stage-page').click({ position: { x: 8, y: 8 } });

/** Three pages that all turn with the curl. */
async function curlBook(page: Page, title: string) {
  await createBlankBook(page, title);
  await insertText(page, 'One');
  for (const text of ['Two', 'Three']) {
    await page.getByRole('button', { name: 'Add page', exact: true }).first().click();
    await insertText(page, text);
  }
  await pageThumb(page, 1).click();
  await clickEmpty(page);
  await page.getByRole('tab', { name: 'Animate' }).click();
  await page.getByRole('radio', { name: 'Page curl' }).click();
  await expect(page.getByTestId('transition-preview')).toBeVisible();
  await page.getByRole('button', { name: 'Use on every page' }).click();
}

async function openPreview(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: 'Preview' }).click();
  const reader = page.getByTestId('preview');
  await expect(reader.locator('.fp-book')).toBeVisible();
  return reader;
}

/**
 * Drags from the book's bottom-right (or bottom-left) corner by a share of its width, slowly
 * (a quick flick counts as a turn whatever its length).
 */
async function dragCorner(
  page: Page,
  reader: ReturnType<Page['getByTestId']>,
  share: number,
  side: 'right' | 'left' = 'right',
) {
  const b = (await reader.locator('.fp-book').boundingBox())!;
  const x = side === 'right' ? b.x + b.width - 6 : b.x + 6;
  const y = b.y + b.height - 6;
  const dir = side === 'right' ? -1 : 1;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(x + (dir * share * b.width * i) / 12, y - (b.height * 0.1 * i) / 12);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(150);
  await page.mouse.up();
}

test('the page curl turns forward and back, in the exported book too', async ({
  page,
  browser,
}) => {
  await curlBook(page, 'Curl book');
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByTestId('export-estimate')).toContainText('Estimated size');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download HTML' }).click(),
  ]);
  const file = test.info().outputPath('curl.html');
  await dl.saveAs(file);

  const context = await browser.newContext();
  const book = await context.newPage();
  const errors: string[] = [];
  book.on('pageerror', (e) => errors.push(e.message));
  await book.goto(pathToFileURL(file).href);
  await expect(book.locator('.fp-indicator')).toHaveText('1 / 3');
  await book.keyboard.press('ArrowRight');
  // Mid-turn: the flap and the page underneath are both drawn.
  await expect(book.locator('.fp-curl-flap-wrap')).toHaveCount(1);
  await expect(book.locator('.fp-page')).toHaveCount(2);
  await expect(book.locator('.fp-indicator')).toHaveText('2 / 3');
  await expect(book.locator('.fp-curl-flap-wrap')).toHaveCount(0);
  await expect(book.locator('.fp-page')).toHaveCount(1);
  await book.keyboard.press('ArrowLeft');
  await expect(book.locator('.fp-curl-flap-wrap')).toHaveCount(1);
  await expect(book.locator('.fp-indicator')).toHaveText('1 / 3');
  await expect(book.locator('.fp-curl-flap-wrap')).toHaveCount(0);
  await expect(book.locator('.fp-page:not([aria-hidden])')).toContainText('One');
  expect(errors).toEqual([]);
  await context.close();
});

test('dragging the corner past a third turns the page; a short drag springs back', async ({
  page,
}) => {
  await curlBook(page, 'Drag book');
  const reader = await openPreview(page);
  const indicator = reader.locator('.fp-indicator');

  await dragCorner(page, reader, 0.2); // 10% of a turn
  await expect(reader.locator('.fp-curl-flap-wrap')).toHaveCount(0);
  await expect(indicator).toHaveText('1 / 3');
  await expect(reader.locator('.fp-page')).toHaveCount(1);

  await dragCorner(page, reader, 1.1); // 55% of a turn
  await expect(indicator).toHaveText('2 / 3');
  await expect(reader.locator('.fp-page:not([aria-hidden])')).toContainText('Two');

  // Back: the bottom-left corner brings page 1 over again.
  await dragCorner(page, reader, 0.6, 'left');
  await expect(indicator).toHaveText('1 / 3');
});

test('a locked page resists the corner and shows the hint', async ({ page }) => {
  await curlBook(page, 'Locked curl');
  await page.getByRole('tab', { name: 'Interact' }).click();
  await page.getByRole('switch', { name: /Tap something to continue/ }).click();
  const reader = await openPreview(page);
  await dragCorner(page, reader, 1.2);
  await expect(reader.locator('.fp-indicator')).toHaveText('1 / 3');
  await expect(page.locator('.fp-root')).toHaveClass(/fp-hinting/);
  await expect(reader.locator('.fp-page')).toHaveCount(1);
});

test('reduced motion turns with a fade instead of the curl', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await curlBook(page, 'Calm curl');
  const reader = await openPreview(page);
  await page.evaluate(() => {
    (window as unknown as { __curled: boolean }).__curled = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid=preview] .fp-curl-flap-wrap'))
        (window as unknown as { __curled: boolean }).__curled = true;
    }).observe(document.body, { subtree: true, childList: true });
  });
  await page.keyboard.press('ArrowRight');
  await expect(reader.locator('.fp-indicator')).toHaveText('2 / 3');
  expect(await page.evaluate(() => (window as unknown as { __curled: boolean }).__curled)).toBe(
    false,
  );
  // Dragging the corner doesn't start a curl either.
  await dragCorner(page, reader, 1.1);
  expect(await page.evaluate(() => (window as unknown as { __curled: boolean }).__curled)).toBe(
    false,
  );
  await context.close();
});

test('dragging stays within the frame budget: no long tasks, a few ms of script per move', async ({
  page,
}) => {
  await curlBook(page, 'Fast curl');
  const reader = await openPreview(page);
  const b = (await reader.locator('.fp-book').boundingBox())!;
  const result = await page.evaluate(
    async ({ x, y, w }) => {
      const long: number[] = [];
      const po = new PerformanceObserver((list) =>
        list.getEntries().forEach((e) => long.push(e.duration)),
      );
      po.observe({ type: 'longtask', buffered: false });
      const stage = document.querySelector<HTMLElement>('.fp-stage')!;
      const fire = (type: string, cx: number, cy: number) =>
        stage.dispatchEvent(
          new PointerEvent(type, {
            clientX: cx,
            clientY: cy,
            pointerId: 7,
            button: 0,
            bubbles: true,
            isPrimary: true,
          }),
        );
      fire('pointerdown', x, y);
      const times: number[] = [];
      for (let i = 1; i <= 40; i++) {
        const t0 = performance.now();
        fire('pointermove', x - (i / 40) * w * 0.3, y - i);
        times.push(performance.now() - t0);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      fire('pointercancel', x, y);
      await new Promise((r) => setTimeout(r, 400));
      po.disconnect();
      times.sort((a, b) => a - b);
      return { median: times[20]!, long };
    },
    { x: b.x + b.width - 6, y: b.y + b.height - 6, w: b.width },
  );
  // The first move mounts the page underneath; after that each move only redraws the fold.
  expect(result.median).toBeLessThan(4);
  expect(result.long.filter((d) => d > 50)).toEqual([]);
});
