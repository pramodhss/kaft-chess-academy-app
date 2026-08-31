import { expect } from '@playwright/test';
import { test } from './fixtures/test';
import { openApp } from './fixtures/sheetsMock';

function sheetRows(workbook: Record<string, string[][]>, tab: string) {
  return workbook[tab].filter(row => row.some(Boolean));
}

test('adds a validated student and synchronizes the attendance roster', async ({ page, sheets }) => {
  await openApp(page, '#/students');
  await page.getByRole('button', { name: 'Add student' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full Name *').fill('Ishaan Rao');
  await dialog.getByLabel('Date of Birth *').fill('2015-04-12');
  await dialog.getByLabel('Parent / Guardian Name *').fill('Anita Rao');
  await dialog.getByLabel('Phone *', { exact: true }).fill('9988776655');
  await dialog.getByLabel('WhatsApp').fill('9977665544');
  await dialog.getByLabel('Email').fill('anita.rao@example.com');
  await dialog.getByLabel('Parent 2 Name').fill('Vikram Rao');
  await dialog.getByLabel('Parent 2 Phone').fill('9966554433');
  await dialog.getByLabel('Assigned Coach').selectOption('Coach Meera');
  await dialog.getByLabel('Joining Date').fill('2026-01-10');
  await dialog.getByLabel('Classical Rating').fill('1250');
  await dialog.getByLabel('Rapid Rating').fill('1200');
  await dialog.getByLabel('Blitz Rating').fill('1150');
  await dialog.getByLabel('TNSCA ID').fill('TN200');
  await dialog.getByLabel('FIDE ID').fill('9876543');
  await dialog.getByLabel('AICF ID').fill('AICF200');
  await dialog.getByLabel('Chess.com Username').fill('ishaan_rook');
  await dialog.getByLabel('Lichess Username').fill('ishaan-knight');
  await dialog.getByLabel('School Name').fill('Lakeview School');
  await dialog.getByLabel('Standard / Class').selectOption('5th');
  await dialog.getByLabel('Grade / School').fill('5th, Lakeview School');
  await dialog.getByLabel('Emergency Contact Name').fill('Rohan Rao');
  await dialog.getByLabel('Emergency Phone').fill('9955443322');
  await dialog.getByLabel('Home Address').fill('12 Lake Road, Chennai');
  await dialog.getByLabel('Photo Consent').selectOption('No');
  await dialog.getByLabel('Notes').fill('Prefers weekday practice.');
  await dialog.getByRole('button', { name: 'Add Student', exact: true }).click();

  await expect(page.getByText('Ishaan Rao', { exact: true })).toBeVisible();
  await expect.poll(() => sheetRows(sheets.workbook, 'Students & Parents').some(row => row[0] === 'Ishaan Rao')).toBe(true);
  await expect.poll(() => sheetRows(sheets.workbook, 'Weekend Attendance').some(row => row[0] === 'Ishaan Rao')).toBe(true);

  const student = sheetRows(sheets.workbook, 'Students & Parents').find(row => row[0] === 'Ishaan Rao');
  expect(student?.[1]).toBe('2015-04-12');
  expect(student?.[4]).toBe('5th, Lakeview School');
  expect(student?.[7]).toBe('2026-01-10');
  expect(student?.[9]).toBe('Anita Rao');
  expect(student?.[10]).toBe('9988776655');
  expect(student?.[11]).toBe('9977665544');
  expect(student?.[12]).toBe('anita.rao@example.com');
  expect(student?.[13]).toBe('Vikram Rao');
  expect(student?.[14]).toBe('9966554433');
  expect(student?.[15]).toBe('Rohan Rao');
  expect(student?.[16]).toBe('9955443322');
  expect(student?.[17]).toBe('12 Lake Road, Chennai');
  expect(student?.[18]).toBe('No');
  expect(student?.[20]).toBe('Prefers weekday practice.');
  expect(student?.[21]).toBe('Lakeview School');
  expect(student?.[22]).toBe('5th');
  expect(student?.[23]).toBe('TN200');
  expect(student?.[24]).toBe('9876543');
  expect(student?.[25]).toBe('AICF200');
  expect(student?.[26]).toBe('1250');
  expect(student?.[27]).toBe('1200');
  expect(student?.[28]).toBe('1150');
  expect(student?.[29]).toBe('Coach Meera');
  expect(student?.[30]).toBe('ishaan_rook');
  expect(student?.[31]).toBe('ishaan-knight');

  await page.getByRole('button', { name: /Ishaan Rao/ }).click();
  await page.getByRole('button', { name: '♟ Chess' }).click();
  await expect(page.getByRole('link', { name: 'ishaan_rook' })).toHaveAttribute('href', 'https://www.chess.com/member/ishaan_rook');
  await expect(page.getByRole('link', { name: 'ishaan-knight' })).toHaveAttribute('href', 'https://lichess.org/@/ishaan-knight');
  await expect(page.getByRole('link', { name: 'ishaan_rook' })).toHaveAttribute('target', '_blank');
  await expect(page.getByRole('link', { name: 'ishaan-knight' })).toHaveAttribute('target', '_blank');
});

test('blocks duplicate student names before writing', async ({ page, sheets }) => {
  await openApp(page, '#/students');
  const writesBefore = sheets.writes.length;
  await page.getByRole('button', { name: 'Add student' }).click();

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

test('requires confirmation and removes a student only after Sheets succeeds', async ({ page, sheets }) => {
  await openApp(page, '#/students');
  await page.getByRole('button', { name: /Aarav Kumar/ }).click();

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Remove Student' }).click();

  await expect(page.getByText('Aarav Kumar was removed from Students.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Aarav Kumar/ })).toHaveCount(0);
  expect(sheets.workbook['Students & Parents'][1].every(value => value === '')).toBe(true);

  // Re-add the same deleted student name with updated details
  await page.getByRole('button', { name: 'Add student' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full Name *').fill('Aarav Kumar');
  await dialog.getByLabel('Date of Birth *').fill('2014-05-10');
  await dialog.getByLabel('Parent / Guardian Name *').fill('Priya Kumar');
  await dialog.getByLabel('Phone *', { exact: true }).fill('9876543210');
  await dialog.getByLabel('Assigned Coach').selectOption('Coach Rajesh');
  await dialog.getByRole('button', { name: 'Add Student', exact: true }).click();

  await expect(page.getByText('Student added successfully. The new profile is ready.')).toBeVisible();
  await expect(page.getByText('Aarav Kumar', { exact: true })).toBeVisible();
});

test('filters phone input and validates email and ratings', async ({ page, sheets }) => {
  await openApp(page, '#/students');
  await page.getByRole('button', { name: 'Add student' }).click();
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

test('imports students from spreadsheet, commits to Sheets, and retains on refresh and navigation', async ({ page, sheets }) => {
  await openApp(page, '#/students');

  // Upload the sample CSV import file
  const csvContent = [
    'Full Name,DOB,Grade / School,Batch,Parent Name,Parent Phone,TNSCA ID,Classical Rating',
    'Rohan Verma,2015-08-12,5th,Beginner,Suresh Verma,9876500111,TN500,1200',
    'Ananya Iyer,2014-03-25,6th,Intermediate,Meenakshi Iyer,9876500222,TN501,1350',
  ].join('\n');

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: 'new_batch.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csvContent),
  });

  // Modal preview should appear
  await expect(page.getByText(/Import Students \(2 found\)/i)).toBeVisible();
  await expect(page.getByText('1. Rohan Verma')).toBeVisible();
  await expect(page.getByText('2. Ananya Iyer')).toBeVisible();

  // Click the save/import button
  await page.getByRole('button', { name: /Import 2 Students to Academy/i }).click();

  // Verify toast and presence in list
  await expect(page.getByText(/Successfully saved 2 students/i)).toBeVisible();
  await expect(page.getByText('Rohan Verma', { exact: true })).toBeVisible();
  await expect(page.getByText('Ananya Iyer', { exact: true })).toBeVisible();

  // Verify committed to mock Sheets workbook
  expect(sheets.workbook['Students & Parents'].some(row => row[0] === 'Rohan Verma')).toBe(true);
  expect(sheets.workbook['Students & Parents'].some(row => row[0] === 'Ananya Iyer')).toBe(true);
  expect(sheets.workbook['Weekend Attendance'].some(row => row[0] === 'Rohan Verma')).toBe(true);
  expect(sheets.workbook['Weekend Attendance'].some(row => row[0] === 'Ananya Iyer')).toBe(true);

  // Navigate to Fees and verify students are retained
  await page.getByRole('link', { name: 'Fees', exact: true }).click();
  await expect(page.getByText('Rohan Verma')).toBeVisible();

  // Refresh page and verify students remain permanently
  await page.reload();
  await expect(page.getByText('Rohan Verma')).toBeVisible();

  // Navigate back to Students and edit one of the imported students
  await openApp(page, '#/students');
  await page.locator('.students-workspace').getByRole('button', { name: /Rohan Verma/ }).click();
  await page.getByRole('button', { name: 'Edit student' }).click();

  const coachInput = page.getByLabel('Assigned Coach');
  await coachInput.selectOption('Coach Anand');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText(/changes were updated successfully/i)).toBeVisible();
});

test('shows imported students immediately even if the post-import reconciliation read fails', async ({ page, sheets }) => {
  await openApp(page, '#/students');

  const csvContent = [
    'Full Name,DOB,Grade / School,Batch,Parent Name,Parent Phone,TNSCA ID,Classical Rating',
    'Kiran Das,2015-01-10,4th,Beginner,Meera Das,9876500333,TN600,1100',
  ].join('\n');

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: 'one_batch.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csvContent),
  });
  await expect(page.getByText(/Import Students \(1 found\)/i)).toBeVisible();

  // Simulate a broken/slow network on the post-import reconciliation read (the GET issued right
  // after the append succeeds). The already-saved import must still show up immediately.
  let failNextStudentsListRead = true;
  await page.route('https://sheets.googleapis.com/**', async route => {
    const request = route.request();
    const url = request.url();
    if (failNextStudentsListRead && request.method() === 'GET' && url.includes('Students') && url.includes('A%3AAG')) {
      failNextStudentsListRead = false;
      await route.abort('failed');
      return;
    }
    await route.fallback();
  });

  await page.getByRole('button', { name: /Import 1 Students to Academy/i }).click();

  await expect(page.getByText(/Successfully saved 1 student/i)).toBeVisible();
  await expect(page.getByText('Kiran Das', { exact: true })).toBeVisible();
  expect(sheets.workbook['Students & Parents'].some(row => row[0] === 'Kiran Das')).toBe(true);
});

test('pre-fills logged-in coach name, provides coach suggestions, and manages inactive archiving', async ({ page, sheets }) => {
  await openApp(page, '#/students');

  // Open add student modal and verify default coach is pre-filled
  await page.getByRole('button', { name: 'Add student' }).click();
  const coachInput = page.getByLabel('Assigned Coach');
  await expect(coachInput).toHaveValue('Coach Meera');

  // Fill in required fields to add a student
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full Name *').fill('Pranav Rao');
  await dialog.getByLabel('Date of Birth *').fill('2015-09-09');
  await dialog.getByLabel('Parent / Guardian Name *').fill('Sanjay Rao');
  await dialog.getByLabel('Phone *', { exact: true }).fill('9876599999');
  await dialog.getByRole('button', { name: 'Add Student', exact: true }).click();
  await expect(page.getByText('Pranav Rao', { exact: true })).toBeVisible();

  // Mark student as Inactive
  await page.locator('.students-workspace').getByRole('button', { name: /Pranav Rao/ }).click();
  await page.getByRole('button', { name: 'Edit student' }).click();
  await page.getByLabel('Status').selectOption('Inactive');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText(/changes were updated successfully/i)).toBeVisible();

  // Verify attendance and fees exclude inactive student
  await openApp(page, '#/attendance');
  await expect(page.getByText('Pranav Rao')).toHaveCount(0);

  await openApp(page, '#/fees');
  await expect(page.getByText('Pranav Rao')).toHaveCount(0);
});

test('filters students list by age category like Under 11, Under 13 via filter modal', async ({ page, sheets }) => {
  await openApp(page, '#/students');

  // Initial roster has Aarav Kumar (11 -> Under 13) and Diya Shah (12 -> Under 13)
  const filterBtn = page.getByRole('button', { name: 'Filter students' });
  await expect(filterBtn).toBeVisible();

  // Open filter modal
  await filterBtn.click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();

  // Filter by Under 13
  await modal.getByRole('button', { name: /Under 13/ }).click();
  await modal.getByRole('button', { name: /Apply/i }).click();
  await expect(modal).toBeHidden();

  await expect(page.getByText('Aarav Kumar', { exact: true })).toBeVisible();
  await expect(page.getByText('Diya Shah', { exact: true })).toBeVisible();

  // Open filter modal again, deselect Under 13, select Under 7 (none should match)
  await filterBtn.click();
  const modal2 = page.getByRole('dialog');
  await modal2.getByRole('button', { name: /Under 13/ }).click();
  await modal2.getByRole('button', { name: /Under 7/ }).click();
  await modal2.getByRole('button', { name: /Apply/i }).click();

  await expect(page.getByText('Aarav Kumar', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Diya Shah', { exact: true })).toHaveCount(0);
  await expect(page.getByText('0 active · 0 total')).toBeVisible();

  // Reset filters via Clear all chip
  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page.getByText('Aarav Kumar', { exact: true })).toBeVisible();
});
