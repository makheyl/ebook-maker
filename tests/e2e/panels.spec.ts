import { expect, test, type Locator, type Page } from '@playwright/test';
import { createBlankBook, insertShape, stageElements } from './helpers';

const width = (l: Locator) => l.evaluate((el) => Math.round(el.getBoundingClientRect().width));
const height = (l: Locator) => l.evaluate((el) => Math.round(el.getBoundingClientRect().height));

async function drag(page: Page, handle: Locator, dx: number, dy: number) {
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}

test('panels resize by dragging and by keyboard, reset, collapse, and are remembered', async ({
  page,
}) => {
  await createBlankBook(page, 'Panels');
  const pages = page.getByRole('navigation', { name: 'Pages' });
  const properties = page.getByRole('complementary', { name: 'Properties' });
  expect(await width(pages)).toBe(184);
  expect(await width(properties)).toBe(304);

  // Drag the page list wider; the thumbnails follow.
  const thumb = page.getByTestId('page-item').first().locator('button').first();
  const thumbBefore = await width(thumb);
  await drag(page, page.getByTestId('resize-left'), 80, 0);
  expect(await width(pages)).toBe(264);
  expect(await width(thumb)).toBeGreaterThan(thumbBefore + 60);

  // Keyboard on the properties edge: ← grows it, Home/End go to the limits.
  const right = page.getByTestId('resize-right');
  await expect(right).toHaveAttribute('role', 'separator');
  await right.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  expect(await width(properties)).toBe(336);
  await expect(right).toHaveAttribute('aria-valuenow', '336');
  await page.keyboard.press('End');
  expect(await width(properties)).toBe(480);
  await page.keyboard.press('Home');
  expect(await width(properties)).toBe(272);
  // Narrow: the tabs become icons but keep their names.
  await expect(page.getByRole('tab', { name: 'Animate' })).toBeVisible();
  await page.keyboard.press('Shift+ArrowLeft');

  // The timeline edge: drag up to make it taller.
  await page.keyboard.press('t');
  const timeline = page.getByTestId('timeline');
  await expect(timeline).toBeVisible();
  expect(await height(timeline)).toBe(240);
  await drag(page, page.getByTestId('resize-bottom'), 0, -60);
  expect(await height(timeline)).toBe(300);

  // Everything is remembered after a reload.
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Pages' })).toBeVisible();
  expect(await width(pages)).toBe(264);
  expect(await width(properties)).toBe(336);
  await page.keyboard.press('t');
  expect(await height(page.getByTestId('timeline'))).toBe(300);

  // Double-click resets an edge.
  await page.getByTestId('resize-left').dblclick();
  expect(await width(pages)).toBe(184);

  // Collapse one panel, then focus mode hides both and brings them back.
  await page.getByRole('button', { name: 'Hide pages panel' }).click();
  await expect(pages).toHaveCount(0);
  await page.getByRole('button', { name: 'Show pages panel' }).click();
  await expect(pages).toBeVisible();
  await page.locator('[data-testid=stage-viewport]').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ControlOrMeta+Backslash');
  await expect(pages).toHaveCount(0);
  await expect(properties).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Backslash');
  await expect(pages).toBeVisible();
  await expect(properties).toBeVisible();
});

test('the right-click menu acts on the element under the pointer, the canvas, and layer rows', async ({
  page,
}) => {
  await createBlankBook(page, 'Menus');
  await insertShape(page, 'Rectangle');
  await page.keyboard.press('Escape');
  const shapes = stageElements(page, 'shape');
  const menu = page.getByTestId('context-menu');

  // Right-click an unselected element: it gets selected, and Duplicate works.
  await page.locator('[data-testid=stage-viewport]').click({ position: { x: 5, y: 5 } });
  await shapes.first().click({ button: 'right' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: /Duplicate/ }).click();
  await expect(shapes).toHaveCount(2);

  // Copy + paste through the menu (the duplicate is on top).
  await shapes.last().click({ button: 'right' });
  await menu.getByRole('menuitem', { name: /^Copy/ }).click();
  await shapes.last().click({ button: 'right' });
  await menu.getByRole('menuitem', { name: /^Paste/ }).click();
  await expect(shapes).toHaveCount(3);

  // Empty canvas: page actions.
  await page.getByTestId('stage-page').click({ button: 'right', position: { x: 10, y: 10 } });
  await expect(menu.getByRole('menuitem', { name: /Select all/ })).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Add page after' }).click();
  await expect(page.getByTestId('page-item')).toHaveCount(2);

  // On a layer row.
  await page.getByRole('button', { name: 'Page 1', exact: true }).click();
  await page.getByRole('tab', { name: 'Layers' }).click();
  const rows = page.getByRole('list', { name: 'Layers' }).getByRole('listitem');
  await expect(rows).toHaveCount(3);
  await rows.first().click({ button: 'right' });
  await menu.getByRole('menuitem', { name: /Delete/ }).click();
  await expect(rows).toHaveCount(2);
});
