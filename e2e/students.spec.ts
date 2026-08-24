import { expect } from '@playwright/test';
import { test } from './fixtures/test';
import { openApp } from './fixtures/sheetsMock';

function sheetRows(workbook: Record<string, string[][]>, tab: string) {
  return workbook[tab].filter(row => row.some(Boolean));
}

test('adds a validated student and synchronizes the attendance roster', async ({ page, sheets }) => {
  await openApp(page, '#/students');
  await page.getByRole('button', { name: '+ Add', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full Name *').fill('Ishaan Rao');
  await dialog.getByLabel('Date of Birth *').fill('2015-04-12');
  await dialog.getByLabel('Parent / Guardian Name *').fill('Anita Rao');
  await dialog.getByLabel('Phone *', { exact: true }).fill('9988776655');
  await dialog.getByLabel('Assigned Coach').fill('Coach Meera');
  await dialog.getByLabel('Chess.com Username').fill('ishaan_rook');
  await dialog.getByLabel('Lichess Username').fill('ishaan-knight');
  await dialog.getByRole('button', { name: 'Add Student', exact: true }).click();

  await expect(page.getByText('Ishaan Rao', { exact: true })).toBeVisible();
  await expect.poll(() => sheetRows(sheets.workbook, 'Students & Parents').some(row => row[0] === 'Ishaan Rao')).toBe(true);
  await expect.poll(() => sheetRows(sheets.workbook, 'Weekend Attendance').some(row => row[0] === 'Ishaan Rao')).toBe(true);

  const student = sheetRows(sheets.workbook, 'Students & Parents').find(row => row[0] === 'Ishaan Rao');
  expect(student?.[1]).toBe('2015-04-12');
  expect(student?.[9]).toBe('Anita Rao');
  expect(student?.[10]).toBe('9988776655');
  expect(student?.[29]).toBe('Coach Meera');
  expect(student?.[30]).toBe('ishaan_rook');
  expect(student?.[31]).toBe('ishaan-knight');

  await page.getByRole('button', { name: /Ishaan Rao/ }).click();
  await expect(page.getByRole('link', { name: 'ishaan_rook' })).toHaveAttribute('href', 'https://www.chess.com/member/ishaan_rook');
  await expect(page.getByRole('link', { name: 'ishaan-knight' })).toHaveAttribute('href', 'https://lichess.org/@/ishaan-knight');
  await expect(page.getByRole('link', { name: 'ishaan_rook' })).toHaveAttribute('target', '_blank');
  await expect(page.getByRole('link', { name: 'ishaan-knight' })).toHaveAttribute('target', '_blank');
});

test('blocks duplicate student names before writing', async ({ page, sheets }) => {
  await openApp(page, '#/students');
  const writesBefore = sheets.writes.length;
  await page.getByRole('button', { name: '+ Add', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full Name *').fill('Aarav Kumar');
  await dialog.getByLabel('Date of Birth *').fill('2014-05-10');
  await dialog.getByLabel('Parent / Guardian Name *').fill('Priya Kumar');
  await dialog.getByLabel('Phone *', { exact: true }).fill('9876543210');
  await dialog.getByRole('button', { name: 'Add Student', exact: true }).click();

  await expect(page.getByText(/student with this name already exists/i)).toBeVisible();
  expect(sheets.writes).toHaveLength(writesBefore);
});

test('updates an existing student phone without a false conflict', async ({ page, sheets }) => {
  await openApp(page, '#/students');
  await page.getByRole('button', { name: /Aarav Kumar/ }).click();
  await page.getByRole('button', { name: 'Edit student' }).click();

  const phone = page.getByLabel('Phone *', { exact: true });
  await phone.fill('9988776655');
  await page.getByRole('button', { name: 'Save Changes' }).click();

  await expect(page.getByText(/changes were updated successfully/i)).toBeVisible();
  await expect(page.getByText('9988776655', { exact: true })).toBeVisible();
  expect(sheets.workbook['Students & Parents'][1][10]).toBe('9988776655');
  await expect(page.getByText(/changed this student at the same time/i)).toHaveCount(0);
});

test('filters phone input and validates email and ratings', async ({ page, sheets }) => {
  await openApp(page, '#/students');
  await page.getByRole('button', { name: '+ Add', exact: true }).click();
  const dialog = page.getByRole('dialog');

  await dialog.getByLabel('Full Name *').fill('Validation Student');
  await dialog.getByLabel('Date of Birth *').fill('2015-04-12');
  await dialog.getByLabel('Parent / Guardian Name *').fill('Validation Parent');
  const phone = dialog.getByLabel('Phone *', { exact: true });
  await phone.fill('98ab-76543210');
  await expect(phone).toHaveValue('9876543210');

  await dialog.getByLabel('Email').fill('invalid@example');
  await expect(dialog.getByRole('alert')).toContainText('valid parent email');
  await dialog.getByLabel('Email').fill('parent@example.com');
  await dialog.getByLabel('Classical Rating').fill('1200.5');
  await expect(dialog.getByRole('alert')).toContainText('whole number');
  await dialog.getByLabel('Classical Rating').fill('1200');
  await dialog.getByLabel('Chess.com Username').fill('https://chess.com/member/player');
  await expect(dialog.getByRole('alert')).toContainText('Chess.com username must use only letters');
  expect(sheets.writes).toHaveLength(0);
});
