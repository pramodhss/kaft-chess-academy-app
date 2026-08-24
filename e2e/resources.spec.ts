import { expect } from '@playwright/test';
import { test } from './fixtures/test';
import { openApp } from './fixtures/sheetsMock';

test('uploads a native PDF to Drive and stores its metadata in Resources', async ({ page, sheets }) => {
  await openApp(page, '#/resources');
  await page.getByRole('button', { name: '+ Add', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Upload PDF').setInputFiles({ name: 'academy-guide.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') });
  await dialog.getByLabel('Allow anyone with the link to view this PDF').check();
  await dialog.getByLabel('Description').fill('Academy training guide');
  await dialog.getByRole('button', { name: 'Add Resource', exact: true }).click();

  await expect(page.getByText('academy-guide', { exact: true })).toBeVisible();
  expect(sheets.driveUploads).toHaveLength(1);
  await expect.poll(() => sheets.workbook.Resources.some(row => row[0] === 'academy-guide')).toBe(true);
  const resource = sheets.workbook.Resources.find(row => row[0] === 'academy-guide');
  expect(resource?.[2]).toBe('https://drive.google.com/file/d/drive-file-1/view');
  expect(resource?.[6]).toBe('drive-file-1');
});