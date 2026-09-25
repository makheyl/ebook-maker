// Regenerates every README screenshot from the sample book.
// Usage: pnpm dev (in another terminal), then: node scripts/screenshots.mjs [baseURL]
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = (name) => new URL(`../docs/screenshots/${name}`, import.meta.url).pathname;
const saved = [];
const shot = async (target, name) => {
  await target.screenshot({ path: out(name) });
  saved.push(name);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const theme = async (value) => {
  await page.evaluate((t) => localStorage.setItem('folio-theme', t), value);
  await page.reload();
  await page.getByTestId('stage-page').waitFor();
};
const dismissTips = async () => {
  const tips = page.getByRole('button', { name: 'Dismiss tips' });
  if (await tips.isVisible().catch(() => false)) await tips.click();
};

await page.goto(base);
await page.getByRole('button', { name: 'Try a sample book' }).click();
await page.getByTestId('page-item').nth(5).waitFor();
await dismissTips();

// 1. The editor, in the dark theme.
await theme('dark');
await page.getByRole('button', { name: 'Page 2', exact: true }).click();
await page.locator('.fl-mode-editor .fl-el[data-character-id]').click();
await page.waitForTimeout(500);
await shot(page, 'editor.png');
await theme('light');

// 2. The Animation Pane for a character.
await page.getByRole('button', { name: 'Page 2', exact: true }).click();
await page.locator('.fl-mode-editor .fl-el[data-character-id]').click();
await page.getByRole('tab', { name: 'Animate' }).click();
await page.waitForTimeout(400);
await shot(page, 'animation-pane.png');

// 3. Character + page timeline (page 2: walk in, hop).
await page.keyboard.press('t');
await page.getByTestId('timeline').waitFor();
await page.getByLabel('Playhead time').fill('1.2');
await page.getByLabel('Playhead time').press('Enter');
await page.waitForTimeout(500);
await shot(page, 'character-timeline.png');
await page.keyboard.press('t');

// 4. Interact tab on the choice page.
await page.getByRole('button', { name: 'Page 3', exact: true }).click();
await page.locator('.fl-mode-editor .fl-el[data-type=button]').first().click();
await page.getByRole('tab', { name: 'Interact' }).click();
await page.waitForTimeout(400);
await shot(page, 'interact.png');

// 5. The reader: the star hunt after finding one star.
await page.getByRole('button', { name: 'Page 1', exact: true }).click();
await page.getByRole('banner').getByRole('button', { name: 'Preview' }).click();
const reader = page.getByTestId('preview');
for (const target of ['2 / 6', '3 / 6']) {
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    if ((await reader.locator('.fp-indicator').textContent()) === target) break;
  }
}
await reader.getByRole('button', { name: 'Down to the sea' }).click();
await page.waitForTimeout(1600);
await reader.getByRole('button', { name: 'Star 1' }).focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(250);
await shot(page, 'storybook-reader.png');

// 6. The exported book, opened from disk.
await page.keyboard.press('Escape');
await page.getByRole('button', { name: 'Export' }).click();
await page.getByTestId('export-estimate').filter({ hasText: 'Estimated size' }).waitFor();
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: 'Download HTML' }).click(),
]);
// Saved with its .html name, so the browser opens it as a page.
const exported = join(tmpdir(), 'inkbug-sample.html');
await download.saveAs(exported);
const book = await context.newPage();
await book.goto(pathToFileURL(exported).href);
const start = book.getByRole('button', { name: 'Tap to start' });
if (await start.isVisible({ timeout: 3000 }).catch(() => false)) await start.click();
await book.waitForTimeout(1500);
await shot(book, 'exported-book.png');
await book.close();

// 7. Importing an export back (the book is already here, so "Keep both" is offered).
await page.goto(base);
await page.getByTestId('import-input').setInputFiles(exported);
await page.getByTestId('import-cover').locator('.fl-page').waitFor();
await page.waitForTimeout(400);
await shot(page, 'import.png');

// 8. Quick create: pages from pasted lines.
await page.goto(`${base}/#/new`);
await page.getByLabel('Title').fill('The Little Seed');
await page.getByRole('button', { name: 'Continue' }).click();
await page
  .getByLabel('Paste your text')
  .fill(
    [
      'A tiny seed slept under the snow.',
      'Spring rain tapped on the ground: wake up!',
      'The seed stretched one green leaf toward the sun.',
      'By summer, it was the tallest sunflower in the garden.',
    ].join('\n'),
  );
await page.getByRole('button', { name: 'Add 4 lines' }).click();
await page.getByTestId('wizard-row').nth(3).waitFor();
await page.waitForTimeout(300);
await shot(page, 'quick-create.png');

await browser.close();
console.log(`Saved ${saved.join(', ')}`);
