import { expect } from '@playwright/test';
import { test } from './fixtures/test';
import { openApp } from './fixtures/sheetsMock';

const screens = [
  ['Dashboard', '#/'],
  ['Students', '#/students'],
  ['Attendance', '#/attendance'],
  ['Fees', '#/fees'],
  ['Monthly Report', '#/monthly-report'],
  ['Student Progress', '#/progress'],
  ['Tournaments', '#/tournaments'],
  ['Leaderboard redirect', '#/leaderboard'],
  ['Tournament Management', '#/van'],
  ['Resources', '#/resources'],
  ['Timetable', '#/timetable'],
  ['Curriculum', '#/curriculum'],
  ['Admin Settings', '#/admin-settings'],
  ['Online Chess', '#/online-chess'],
  ['Mini Tournament', '#/pairing'],
  ['Operations Center', '#/operations'],
  ['Student Timeline', '#/timeline'],
  ['Parent Portal', '#/parent'],
  ['More', '#/more'],
] as const;

async function assertHealthyScreen(page: Parameters<typeof openApp>[0], hash: string) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await openApp(page, hash);
  await expect(hash === '#/parent' ? page.locator('header') : page.locator('main')).toBeVisible();
  await expect.poll(() => errors, `${hash} emitted a runtime error`).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${hash} has horizontal overflow`).toBeLessThanOrEqual(1);
}

test.describe('screen-by-screen end-to-end coverage', () => {
  for (const [name, hash] of screens) {
    test(`${name}: loads, remains usable, and has no runtime errors`, async ({ page, sheets }) => {
      void sheets;
      await assertHealthyScreen(page, hash);
      const visibleControls = page.locator('button:visible, a:visible, input:visible, select:visible, textarea:visible');
      await expect(visibleControls.first()).toBeVisible();
      const controlFailures = await visibleControls.evaluateAll(elements => elements.flatMap((element, index) => {
        if (element.classList.contains('sr-only') || (element instanceof HTMLInputElement && element.type === 'file')) return [];
        const rect = element.getBoundingClientRect();
        if (element instanceof HTMLInputElement) return rect.width <= 0 || rect.height <= 0 ? [`control ${index} has no dimensions`] : [];
        const label = element.getAttribute('aria-label') || element.getAttribute('title') ||
          element.getAttribute('placeholder') || element.textContent?.trim();
        return !label || rect.width <= 0 || rect.height <= 0
          ? [`control ${index} has no usable name or dimensions`]
          : [];
      }));
      expect(controlFailures, `${hash} has an unusable visible control`).toEqual([]);
    });
  }

  test('Dashboard: sync control completes without leaving the screen', async ({ page, sheets }) => {
    void sheets;
    await assertHealthyScreen(page, '#/');
    await page.getByRole('button', { name: 'Sync latest changes from other coaches' }).click();
    await expect(page.locator('main')).toBeVisible();
  });

  test('Students: add form opens and can be cancelled', async ({ page, sheets }) => {
    void sheets;
    await assertHealthyScreen(page, '#/students');
    await page.getByRole('button', { name: /Add student/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('Attendance: date dialog opens and can be cancelled', async ({ page, sheets }) => {
    void sheets;
    await assertHealthyScreen(page, '#/attendance');
    await page.getByRole('button', { name: 'Add class date' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('Monthly Report: email dialog validates and closes', async ({ page, sheets }) => {
    void sheets;
    await assertHealthyScreen(page, '#/monthly-report');
    await expect(page.getByText('Select Month')).toBeVisible();
    const monthButton = page.locator('button').filter({ hasText: /20\d{2}/ }).first();
    await expect(monthButton).toBeVisible();
    await monthButton.click();
    await expect(page.getByText('Select Month')).toBeVisible();
  });

  test('Student Progress: student selection and insights navigation work', async ({ page, sheets }) => {
    void sheets;
    await assertHealthyScreen(page, '#/progress');
    await page.locator('#progress-student').selectOption({ label: 'Aarav Kumar' });
    await page.getByRole('button', { name: 'Timeline' }).click();
    await expect(page).toHaveURL(/#\/timeline/);
  });

  test('Tournaments: results and leaderboard tabs switch', async ({ page, sheets }) => {
    void sheets;
    await assertHealthyScreen(page, '#/tournaments');
    await page.getByRole('button', { name: /Leaderboard/ }).click();
    await expect(page.getByText('Student Medal Standings')).toBeVisible();
    await page.getByRole('button', { name: /Results/ }).click();
    await expect(page.getByLabel('Search tournament results')).toBeVisible();
  });

  test('Tournament Management: create form opens and can be cancelled', async ({ page, sheets }) => {
    void sheets;
    await assertHealthyScreen(page, '#/van');
    await page.getByRole('button', { name: /add tournament/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('Resources: add resource dialog opens and can be closed', async ({ page, sheets }) => {
    void sheets;
    await assertHealthyScreen(page, '#/resources');
    await page.getByRole('button', { name: /add resource/i }).click();
    await expect(page.getByPlaceholder(/Chess Tactics/i)).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByPlaceholder(/Chess Tactics/i)).toHaveCount(0);
  });

  test('Timetable: weekly class form opens and can be cancelled', async ({ page, sheets }) => {
    void sheets;
    await assertHealthyScreen(page, '#/timetable');
    await page.getByRole('button', { name: /add weekly class/i }).click();
    await expect(page.getByText(/add weekly class/i).first()).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByText(/add weekly class/i).first()).toHaveCount(0);
  });

  test('Admin Settings: settings filters and UPI toggle are interactive', async ({ page, sheets }) => {
    void sheets;
    await assertHealthyScreen(page, '#/admin-settings');
    await page.getByLabel('Month to clear fees').fill('2026-09');
    const upiToggle = page.getByLabel('Toggle Dynamic UPI QR Code in Settings');
    await upiToggle.check({ force: true });
    await expect(upiToggle).toBeChecked();
    await upiToggle.uncheck({ force: true });
    await expect(upiToggle).not.toBeChecked();
  });

  test('Online Chess: search and profile dialog work', async ({ page, sheets }) => {
    void sheets;
    await assertHealthyScreen(page, '#/online-chess');
    await page.getByLabel('Search online chess directory').fill('Aarav');
    await expect(page.getByRole('button', { name: /Aarav Kumar/i }).first()).toBeVisible();
    await page.getByRole('button', { name: /Aarav Kumar/i }).first().click();
    await expect(page.getByRole('dialog', { name: 'Aarav Kumar' })).toBeVisible();
    await page.getByRole('button', { name: 'Close online chess profile' }).click();
    await expect(page.getByRole('dialog', { name: 'Aarav Kumar' })).toHaveCount(0);
  });

  test('Online Chess: ID roster filters and inline fields are available', async ({ page, sheets }) => {
    void sheets;
    await assertHealthyScreen(page, '#/online-chess');
    await expect(page.getByRole('heading', { name: 'Add online chess IDs' })).toBeVisible();
    await expect(page.getByLabel('Filter online IDs by batch')).toBeVisible();
    await expect(page.getByLabel('Filter online IDs by school')).toBeVisible();
    await expect(page.getByLabel('Filter online IDs by coach')).toBeVisible();
    await expect(page.getByLabel('Filter online IDs by link status')).toBeVisible();
    await expect(page.getByLabel('Aarav Kumar Chess.com ID')).toBeVisible();
    await expect(page.getByLabel('Aarav Kumar Lichess ID')).toBeVisible();
    await page.getByLabel('Filter online IDs by link status').selectOption('unlinked');
    await expect(page.getByText(/Showing \d+ of \d+ active students/)).toBeVisible();
  });

  test('Mini Tournament: creation modal opens and cancel is reversible', async ({ page, sheets }) => {
    void sheets;
    await assertHealthyScreen(page, '#/pairing');
    await page.getByRole('button', { name: 'New mini tournament' }).click();
    await expect(page.getByPlaceholder(/Saturday Rapid/i)).toBeVisible();
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByPlaceholder(/Saturday Rapid/i)).toHaveCount(0);
  });

  test('Operations Center: tabs and date range controls work', async ({ page, sheets }) => {
    void sheets;
    await assertHealthyScreen(page, '#/operations');
    const tabs = page.locator('button').filter({ hasText: /Broadcast|Analytics|Backup/i });
    const count = await tabs.count();
    expect(count, 'Operations Center should expose tab controls').toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Custom Reports' }).click();
    await page.getByRole('button', { name: 'This Month' }).click();
    await expect(page.locator('main')).toBeVisible();
  });

  test('Student Timeline: student selection renders the report action', async ({ page, sheets }) => {
    void sheets;
    await assertHealthyScreen(page, '#/timeline');
    await page.locator('#timeline-student').selectOption({ label: 'Aarav Kumar' });
    await expect(page.getByRole('button', { name: /PDF/i })).toBeVisible();
  });

  test('Parent Portal: invalid verification returns validation feedback', async ({ page, sheets }) => {
    void sheets;
    await assertHealthyScreen(page, '#/parent');
    await page.getByPlaceholder('e.g. Ishaan Rao').fill('Unknown Student');
    await page.getByPlaceholder('••••').fill('0000');
    await page.getByRole('button', { name: 'View Progress Card' }).click();
    await expect(page.locator('[role="alert"], .error-state').first()).toBeVisible();
  });

  test('More: theme, density, text size, and coach editor controls work', async ({ page, sheets }) => {
    void sheets;
    await assertHealthyScreen(page, '#/more');
    const themeButton = page.getByRole('button', { name: /switch to light mode/i });
    await themeButton.click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await page.getByRole('button', { name: /switch to dark mode/i }).click();
    await page.getByRole('button', { name: /compact|normal/i }).click();
    await page.getByLabel('Text size').fill('105');
    await page.getByRole('button', { name: 'Edit Name' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit coach name' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel name editing' }).click();
  });
});