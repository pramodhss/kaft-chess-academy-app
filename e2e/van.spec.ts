import { expect } from '@playwright/test';
import { test } from './fixtures/test';
import { openApp } from './fixtures/sheetsMock';

test('migrates legacy rows and saves a tournament transport assignment', async ({ page, sheets }) => {
  await openApp(page, '#/van');

  await expect(page.getByText('Legacy transport assignment')).toBeVisible();
  expect(sheets.workbook['Van Allotment'][0][2]).toBe('Tournament');
  expect(sheets.workbook['Van Allotment'][1][12]).toContain('Previous batch: Beginner A');

  await page.getByRole('button', { name: 'Add transport assignment' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Student').selectOption('Diya Shah');
  await dialog.getByLabel('Tournament').fill('State Junior Open');
  await dialog.getByLabel('Pickup location').fill('KAFT Academy');
  await dialog.getByLabel('Pickup time').fill('07:30');
  await dialog.getByLabel('Return location').fill('KAFT Academy');
  await dialog.getByLabel('Return time').fill('18:00');
  await dialog.getByLabel('Driver', { exact: true }).fill('Rajesh');
  await dialog.getByLabel('Driver phone').fill('9876543210');
  await dialog.getByLabel('Transport fee').fill('750');
  await dialog.getByLabel('Status').selectOption('Confirmed');
  await dialog.getByLabel('Notes').fill('Two-way travel');
  await dialog.getByRole('button', { name: 'Assign transport' }).click();

  await expect(page.getByText('State Junior Open')).toBeVisible();
  const append = sheets.writes.find(write => write.operation === 'append' && write.range.includes('Van Allotment'));
  expect(append?.values[0]).toEqual([
    expect.stringMatching(/^VAN-[A-Z0-9]{6}$/),
    'Diya Shah', 'State Junior Open', '9123456780', 'KAFT Academy', '07:30', 'KAFT Academy', '18:00',
    'Rajesh', '9876543210', '750', 'Confirmed', 'Two-way travel',
  ]);
});