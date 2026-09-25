import { expect, test } from '@playwright/test';
import {
  addLanguages,
  createBlankBook,
  insertText,
  makeWav,
  uploadVoiceClip,
  waitForSaved,
} from './helpers';

test('voiceover in two languages survives export and import; sound effects stay separate', async ({
  page,
}) => {
  await createBlankBook(page, 'Two voices');
  await insertText(page, 'Once upon a time');
  await addLanguages(page, ['English', 'Tagalog']);
  await expect(page.getByText('Default', { exact: true })).toBeVisible();

  // One slot per language for this page.
  await uploadVoiceClip(page, /Upload English voiceover for page 1/, makeWav(300), 'p1-en.wav');
  await expect(page.getByTestId('voice-slot-en')).toContainText('p1-en.wav');
  // Tagalog has no clip yet: the reader will hear English there.
  await expect(page.getByTestId('voice-slot-tl')).toContainText('Uses English');
  await uploadVoiceClip(page, /Upload Tagalog voiceover for page 1/, makeWav(400), 'p1-tl.wav');
  await expect(page.getByTestId('voice-slot-tl')).toContainText('p1-tl.wav');

  // Sound effects are their own section.
  const effects = page.getByRole('list', { name: 'Sound effects' });
  await expect(effects).toHaveCount(0);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Upload sound' }).click(),
  ]);
  await chooser.setFiles({ name: 'birds.wav', mimeType: 'audio/wav', buffer: makeWav(200, 2) });
  await expect(effects.getByRole('listitem')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'When this page opens' }).click();
  await page.getByRole('option', { name: 'birds' }).click();
  await waitForSaved(page);

  // Export, then import the export: both recordings come back.
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByTestId('export-estimate')).toContainText('voiceover');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download HTML' }).click(),
  ]);
  const file = test.info().outputPath('two-voices.html');
  await dl.saveAs(file);
  await page.keyboard.press('Escape');

  await page.goto('/');
  await page.getByTestId('import-input').setInputFiles(file);
  const dialog = page.getByTestId('import-dialog');
  await expect(dialog).toContainText('2 voice recordings');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Import book' }).click();
  await expect(page.locator('[data-testid=stage-page] .fl-page')).toBeVisible();
  await page.getByTestId('stage-page').click({ position: { x: 8, y: 8 } });
  await page.getByRole('tab', { name: 'Audio' }).click();
  await expect(page.getByTestId('voice-slot-en')).toContainText('p1-en.wav');
  await expect(page.getByTestId('voice-slot-tl')).toContainText('p1-tl.wav');
  await expect(page.getByRole('combobox', { name: 'When this page opens' })).toHaveText('birds');
  // The recordings still play in the editor.
  await page.getByRole('button', { name: 'Play Tagalog voiceover for page 1' }).click();
  await expect(
    page.getByRole('button', { name: 'Stop Tagalog voiceover for page 1' }),
  ).toBeVisible();
});

test('removing a language removes its recordings, with Undo', async ({ page }) => {
  await createBlankBook(page, 'Remove a language');
  await addLanguages(page, ['English', 'Tagalog']);
  await uploadVoiceClip(page, /Upload Tagalog voiceover for page 1/, makeWav(300), 'tl.wav');
  await page.getByRole('button', { name: 'Remove Tagalog' }).click();
  await expect(page.getByText('Removed Tagalog and 1 recording.')).toBeVisible();
  await expect(page.getByTestId('voice-slot-tl')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).last().click();
  await expect(page.getByTestId('voice-slot-tl')).toContainText('tl.wav');
});
