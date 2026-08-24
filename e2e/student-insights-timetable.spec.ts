import { expect } from '@playwright/test';
import { test } from './fixtures/test';
import { openApp } from './fixtures/sheetsMock';

test('downloads individual progress and timeline PDF reports', async ({ page, sheets }) => {
  void sheets;
  await openApp(page, '#/progress');
  await page.getByLabel('Select Student').selectOption('Aarav Kumar');
  await expect(page.getByText('Attendance Trend (%)')).toBeVisible();
  const progressDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF' }).click();
  await expect((await progressDownload).suggestedFilename()).toBe('KAFT_Aarav_Kumar_Progress_Report.pdf');

  await openApp(page, '#/timeline');
  await expect(page.getByText('Due: ₹1,500')).toBeVisible();
  await expect(page.getByText('Balance: ₹500')).toBeVisible();
  const attendanceSection = page.locator('details').filter({ hasText: 'Monthly attendance' });
  await expect(attendanceSection).toHaveJSProperty('open', true);
  await attendanceSection.locator('summary').click();
  await expect(attendanceSection).toHaveJSProperty('open', false);
  const timelineDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF' }).click();
  await expect((await timelineDownload).suggestedFilename()).toBe('KAFT_Aarav_Kumar_Timeline_Report.pdf');
});

test('persists text size without creating mobile overflow', async ({ page, sheets }) => {
  void sheets;
  await openApp(page, '#/more');
  const slider = page.getByLabel('Text size');
  await slider.fill('110');
  await expect(slider).toHaveValue('110');
  await page.reload();
  await expect(page.getByLabel('Text size')).toHaveValue('110');
  await expect(page.locator('html')).toHaveCSS('font-size', '17.6px');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('migrates legacy timetable and manages weekly classes shown on Dashboard', async ({ page, sheets }) => {
  await openApp(page, '#/timetable');
  await expect(page.getByText('Intermediate')).toBeVisible();
  expect(sheets.workbook.Timetable[0][1]).toBe('Batch');
  expect(sheets.workbook.Timetable[1].slice(0, 8)).toEqual(['Saturday', 'Intermediate', '', '10:00', '12:00', 'Coach Meera', '', 'Main Hall']);

  await page.getByRole('button', { name: 'Add weekly class' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Day').selectOption('Monday');
  await dialog.getByLabel('Batch').fill('Beginner A');
  await dialog.getByLabel('Level').fill('Beginner');
  await dialog.getByLabel('Start time').fill('17:00');
  await dialog.getByLabel('End time').fill('18:30');
  await dialog.getByLabel('Coach', { exact: true }).fill('Coach Meera');
  await dialog.getByLabel('Room / location').fill('Training Room');
  await dialog.getByLabel('Capacity').fill('12');
  await dialog.getByLabel('Enrolled').fill('8');
  await dialog.getByRole('button', { name: 'Add class' }).click();
  await expect(page.getByRole('heading', { name: 'Beginner A' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit Beginner A class' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Room / location').fill('Room 2');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Room 2')).toBeVisible();

  await openApp(page, '#/');
  await expect(page.getByRole('heading', { name: 'Beginner A' })).toBeVisible();
  await expect(page.getByText('Room 2')).toBeVisible();

  await openApp(page, '#/timetable');
  page.once('dialog', confirmation => confirmation.accept());
  await page.getByRole('button', { name: 'Remove Beginner A class' }).click();
  await expect(page.getByRole('heading', { name: 'Beginner A' })).toHaveCount(0);
  expect(sheets.writes.some(write => write.operation === 'append' && write.range.includes('Timetable'))).toBe(true);
  expect(sheets.writes.some(write => write.operation === 'update' && /Timetable.*A3:M3/.test(write.range))).toBe(true);
  expect(sheets.writes.some(write => write.operation === 'clear' && /Timetable.*A3:M3/.test(write.range))).toBe(true);
});