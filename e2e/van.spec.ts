import { expect } from '@playwright/test';
import { test } from './fixtures/test';
import { openApp } from './fixtures/sheetsMock';

test('requires a tournament name and date before saving', async ({ page, sheets }) => {
  void sheets;
  await openApp(page, '#/van');
  await page.getByRole('button', { name: 'Add tournament' }).click();
  await expect(page.getByRole('alert')).toContainText('Enter the tournament name');
  await page.getByLabel('Tournament name').fill('Validation Open');
  await expect(page.getByRole('alert')).toContainText('Select the tournament date');
});

test('manages a tournament roster, payments, and automatic student history', async ({ page, sheets }) => {
  await openApp(page, '#/van');
  await page.getByRole('button', { name: 'Add tournament' }).click();
  const createDialog = page.getByRole('dialog');
  await createDialog.getByLabel('Tournament name').fill('State Junior Open');
  await createDialog.getByLabel('Tournament date').fill('2026-09-14');
  await createDialog.getByLabel('Entry fee (₹)').fill('750');
  await createDialog.getByRole('button', { name: 'Create tournament' }).click();

  await expect(page.getByText('State Junior Open', { exact: true })).toBeVisible();
  const tournamentRow = sheets.workbook['Upcoming Tournaments'].find(row => row[0] === 'State Junior Open');
  expect(tournamentRow?.[2]).toBe('2026-09-14');
  expect(tournamentRow?.[5]).toBe('750');
  expect(tournamentRow?.[12]).toMatch(/^TRN-[A-Z0-9]{8}$/);

  await page.getByRole('button', { name: /State Junior Open/ }).first().click();
  await page.getByLabel('Aarav Kumar playing').check();
  await page.getByLabel('Aarav Kumar fee paid').check();
  await page.getByLabel('Diya Shah playing').check();
  await page.getByRole('button', { name: 'Save roster' }).click();
  await expect(page.getByText('State Junior Open roster was saved.')).toBeVisible();

  const registrations = sheets.workbook['Tournament Registrations'];
  const aarav = registrations.find(row => row[4] === 'Aarav Kumar');
  const diya = registrations.find(row => row[4] === 'Diya Shah');
  expect(aarav?.slice(1, 8)).toEqual(['State Junior Open', '2026-09-14', '2026-09', 'Aarav Kumar', 'Yes', 'Yes', '750']);
  expect(diya?.[5]).toBe('Yes');
  expect(diya?.[6]).toBe('No');
  // Van Required (index 10) and Student Notes (index 11) start as 'No' and '' for new rows
  expect(aarav?.[10]).toBe('No');
  expect(aarav?.[11]).toBe('');

  await openApp(page, '#/students');
  await page.getByRole('button', { name: /Aarav Kumar/ }).click();
  await page.getByRole('button', { name: '♟ Chess' }).click();
  await expect(page.getByText('Tournament Attendance')).toBeVisible();
  await expect(page.getByText('State Junior Open', { exact: true })).toBeVisible();
  await expect(page.getByText('September 2026')).toBeVisible();
  await expect(page.getByText(/Fee paid.*₹750/)).toBeVisible();

  await openApp(page, '#/timeline');
  await page.locator('#timeline-student').selectOption('Aarav Kumar');
  await page.getByText('Tournament history').click();
  await expect(page.getByText('State Junior Open', { exact: true })).toBeVisible();
  await expect(page.getByText('Fee paid: Yes')).toBeVisible();

  await openApp(page, '#/van');
  await page.getByRole('button', { name: 'Edit State Junior Open' }).click();
  const editDialog = page.getByRole('dialog');
  await editDialog.getByLabel('Tournament name').fill('State Junior Championship');
  await editDialog.getByLabel('Entry fee (₹)').fill('900');
  await editDialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('State Junior Championship', { exact: true })).toBeVisible();
  expect(aarav?.[1]).toBe('State Junior Championship');
  expect(aarav?.[7]).toBe('900');

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Remove State Junior Championship' }).click();
  await expect(page.getByText('State Junior Championship', { exact: true })).toHaveCount(0);
  expect(tournamentRow?.every(value => value === '')).toBe(true);
  expect(aarav?.every(value => value === '')).toBe(true);
});