import { expect, test } from '@playwright/test';
import { createBlankBook, insertShape, insertText, stageElements, waitForSaved } from './helpers';

test('edits persist across a reload (autosave)', async ({ page }) => {
  await createBlankBook(page, 'Persistence');
  await insertText(page, 'Hello persistent world');
  await insertShape(page, 'Rectangle');
  await expect(stageElements(page)).toHaveCount(2);
  await waitForSaved(page);

  await page.reload();
  await expect(stageElements(page)).toHaveCount(2);
  await expect(stageElements(page, 'text')).toContainText('Hello persistent world');
  // The page thumbnail renders the same content.
  await expect(page.getByTestId('page-item').first()).toContainText('Hello persistent world');
});

test('one drag is one undo step', async ({ page }) => {
  await createBlankBook(page, 'Undo');
  await insertShape(page, 'Ellipse');
  const shape = stageElements(page, 'shape');
  const before = (await shape.boundingBox())!;

  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++)
    await page.mouse.move(
      before.x + before.width / 2 + i * 15,
      before.y + before.height / 2 + i * 5,
    );
  await page.mouse.up();
  const moved = (await shape.boundingBox())!;
  expect(moved.x - before.x).toBeGreaterThan(100);

  await page.getByRole('button', { name: 'Undo' }).click();
  const undone = (await shape.boundingBox())!;
  expect(Math.abs(undone.x - before.x)).toBeLessThan(1);
  expect(Math.abs(undone.y - before.y)).toBeLessThan(1);

  await page.getByRole('button', { name: 'Redo' }).click();
  const redone = (await shape.boundingBox())!;
  expect(Math.abs(redone.x - moved.x)).toBeLessThan(1);
});

test('keyboard shortcuts: duplicate, nudge, delete, deselect, undo', async ({ page }) => {
  await createBlankBook(page, 'Shortcuts');
  await insertShape(page, 'Rectangle');
  const x = page.getByLabel('X', { exact: true });
  const startX = Number(await x.inputValue());

  await page.keyboard.press('ArrowRight');
  await expect(x).toHaveValue(String(startX + 1));
  await page.keyboard.press('Shift+ArrowRight');
  await expect(x).toHaveValue(String(startX + 11));

  await page.keyboard.press('ControlOrMeta+d');
  await expect(stageElements(page, 'shape')).toHaveCount(2);

  await page.keyboard.press('Delete');
  await expect(stageElements(page, 'shape')).toHaveCount(1);

  await page.keyboard.press('ControlOrMeta+z');
  await expect(stageElements(page, 'shape')).toHaveCount(2);

  await page.keyboard.press('Escape');
  await expect(page.getByText('Page background')).toBeVisible();

  await page.keyboard.press('ControlOrMeta+a');
  await expect(page.getByText('2 elements')).toBeVisible();
});

test('copy and paste elements', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await createBlankBook(page, 'Clipboard');
  await insertShape(page, 'Rectangle');
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+v');
  await expect(stageElements(page, 'shape')).toHaveCount(2);
});

test('text styling from the properties panel and layers panel toggles', async ({ page }) => {
  await createBlankBook(page, 'Styling');
  await insertText(page, 'Style me');
  const text = stageElements(page, 'text');
  await text.click();
  const size = page.getByLabel('Size');
  await size.fill('120');
  await size.press('Enter');
  await expect(text.locator('.fl-text')).toHaveCSS('font-size', '120px');

  await page.getByRole('tab', { name: 'Layers' }).click();
  await page.getByRole('button', { name: 'Hide Style me' }).click();
  await expect(text).toBeHidden();
  await page.getByRole('button', { name: 'Show Style me' }).click();
  await expect(text).toBeVisible();
});
