// Regenerates the v2 README screenshots from the sample book.
// Usage: pnpm dev (in another terminal), then: node scripts/screenshots.mjs [baseURL]
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = (name) => new URL(`../docs/screenshots/${name}`, import.meta.url).pathname;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto(base);
await page.getByRole('button', { name: 'Try a sample book' }).click();
await page.getByTestId('page-item').nth(5).waitFor();
const tips = page.getByRole('button', { name: 'Close tips' });
if (await tips.isVisible().catch(() => false)) await tips.click();

// 1. Character + page timeline (page 2: walk in, hop).
await page.getByRole('button', { name: 'Page 2', exact: true }).click();
await page.locator('.fl-mode-editor .fl-el[data-character-id]').click();
await page.getByRole('tab', { name: 'Animate' }).click();
await page.keyboard.press('t');
await page.getByTestId('timeline').waitFor();
await page.getByLabel('Playhead time').fill('1.2');
await page.getByLabel('Playhead time').press('Enter');
await page.waitForTimeout(500);
await page.screenshot({ path: out('character-timeline.png') });
await page.keyboard.press('t');

// 2. Interact tab on the choice page.
await page.getByRole('button', { name: 'Page 3', exact: true }).click();
await page.locator('.fl-mode-editor .fl-el[data-type=button]').first().click();
await page.getByRole('tab', { name: 'Interact' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: out('interact.png') });

// 3. The reader: the star hunt after finding one star.
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
await page.screenshot({ path: out('storybook-reader.png') });

await browser.close();
console.log('Saved character-timeline.png, interact.png, storybook-reader.png');
