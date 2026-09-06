import { expect } from '@playwright/test';
import { test } from './fixtures/test';
import { openApp } from './fixtures/sheetsMock';

const routes = [
  ['Dashboard', '#/'],
  ['Students', '#/students'],
  ['Attendance', '#/attendance'],
  ['Fees', '#/fees'],
  ['Monthly Report', '#/monthly-report'],
  ['Student Progress', '#/progress'],
  ['Tournaments', '#/tournaments'],
  ['Tournament Management legacy route', '#/upcoming'],
  ['Tournament Management', '#/van'],
  ['Resources', '#/resources'],
  ['Timetable', '#/timetable'],
  ['Curriculum', '#/curriculum'],
  ['Leaderboard', '#/leaderboard'],
  ['Admin Settings', '#/admin-settings'],
  ['Online Chess', '#/online-chess'],
  ['Mini Tournament', '#/pairing'],
  ['Operations Center', '#/operations'],
  ['Student Timeline', '#/timeline'],
  ['More', '#/more'],
] as const;

test.describe('route regression matrix', () => {
  for (const [name, hash] of routes) {
    test(`${name} renders without runtime errors or horizontal overflow`, async ({ page, sheets }) => {
      void sheets;
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
      });

      await openApp(page, hash);
      await expect(page.locator('main')).toBeVisible();
      if (hash === '#/') await expect(page.getByRole('button', { name: 'Go back' })).toHaveCount(0);
      else await expect(page.getByRole('button', { name: 'Go back' })).toBeVisible();
      await expect.poll(() => errors).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });

  }

  test('reuses shared student data during in-app navigation', async ({ page, sheets }) => {
    void sheets;
    let studentReads = 0;
    page.on('request', request => {
      const url = decodeURIComponent(request.url());
      if (request.method() === 'GET' && url.includes("'Students & Parents'!A:AG")) studentReads += 1;
    });

    await openApp(page, '#/');
    await expect(page.locator('.stat-card-blue')).toBeVisible();
    await page.getByRole('link', { name: 'Students', exact: true }).first().click();
    await expect(page.getByRole('button', { name: /Aarav Kumar/ })).toBeVisible();
    await page.getByRole('link', { name: 'Fees', exact: true }).first().click();
    await expect(page.getByText('Student fees')).toBeVisible();

    expect(studentReads).toBe(1);
  });

  test('dark mode persists and remains usable', async ({ page, sheets }) => {
    void sheets;
    await openApp(page, '#/more');
    await expect(page.locator('html')).toHaveClass(/dark/);
    const themeButton = page.getByText('Dark mode').locator('..').getByRole('button');
    await themeButton.click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('defaults to dark mode on first load', async ({ page, sheets }) => {
    void sheets;
    await page.goto('./#/');
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.locator('main')).toBeVisible();
  });

  test('light-theme gold headings and icons remain readable on every route', async ({ page, sheets }) => {
    void sheets;
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    for (const [, hash] of routes) {
      await page.goto(`./${hash}`);
      await expect(page.locator('main')).toBeVisible();
      await page.evaluate(() => new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
      const failures = await page.locator('.text-gold:visible').evaluateAll(elements => {
        const parse = (value: string) => {
          const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
          return match ? [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] ?? 1)] : null;
        };
        const luminance = (rgb: number[]) => rgb.slice(0, 3)
          .map(value => value / 255)
          .map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
          .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
        return elements.flatMap(element => {
          const foreground = parse(getComputedStyle(element).color);
          if (!foreground) return [`${element.tagName} has no readable foreground color`];
          let current: Element | null = element;
          let background = [255, 255, 255, 1];
          while (current) {
            const candidate = parse(getComputedStyle(current).backgroundColor);
            if (candidate && candidate[3] > 0) {
              background = candidate;
              break;
            }
            current = current.parentElement;
          }
          const ratio = (Math.max(luminance(foreground), luminance(background)) + 0.05) /
            (Math.min(luminance(foreground), luminance(background)) + 0.05);
          return ratio >= 4.5 ? [] : [`${element.tagName}.${element.className} contrast ${ratio.toFixed(2)}`];
        });
      });
      expect(failures, `${hash} has low-contrast gold content`).toEqual([]);
    }
  });

  test('saved coach name editor can be dismissed without changing the name', async ({ page, sheets }) => {
    void sheets;
    await openApp(page, '#/more');
    const currentName = await page.locator('main strong').first().textContent();
    await page.getByRole('button', { name: 'Edit Name' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit coach name' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel name editing' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('main strong').first()).toHaveText(currentName ?? '');
  });

  test('visible controls have accessible names and usable hit areas', async ({ page, sheets }) => {
    void sheets;
    for (const [, hash] of routes) {
      await page.goto(`./${hash}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('main')).toBeVisible();
      await page.evaluate(() => new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
      const controls = page.locator('button:visible, a:visible, input:visible, select:visible, textarea:visible');
      const failures = await controls.evaluateAll(elements => elements.flatMap((element, index) => {
        const rect = element.getBoundingClientRect();
        const text = element.textContent?.trim() ?? '';
        const label = element.closest('label')?.textContent?.trim() ?? '';
        const name = element.getAttribute('aria-label') || element.getAttribute('title') || label || element.getAttribute('placeholder') || text;
        const issues: string[] = [];
        if (!name) issues.push(`missing accessible name on ${element.tagName} #${index}`);
        if (rect.width <= 0 || rect.height <= 0) issues.push(`zero-size ${element.tagName} #${index}`);
        return issues;
      }));
      expect(failures, `control audit failed for ${hash}`).toEqual([]);
    }
  });

  test('Online Chess opens a student profile and returns with the profile back button', async ({ page, sheets }) => {
    void sheets;
    await openApp(page, '#/online-chess');
    await page.getByRole('button', { name: /Aarav Kumar/ }).first().click();
    await expect(page.getByRole('dialog', { name: 'Aarav Kumar' })).toBeVisible();
    await page.getByRole('button', { name: 'Visit student profile' }).click();
    await expect(page).toHaveURL(/#\/students\?student=Aarav%20Kumar/);
    await expect(page.getByRole('button', { name: 'Go back' })).toBeVisible();
    await page.getByRole('button', { name: 'Go back' }).click();
    await expect(page).toHaveURL(/#\/online-chess$/);
    await expect(page.getByText('Online Chess IDs', { exact: true })).toBeVisible();
  });

  test('Mini Tournament creates a session, pairs round 1, and records a result', async ({ page, sheets }) => {
    void sheets;
    await openApp(page, '#/pairing');
    await page.getByRole('button', { name: 'New mini tournament' }).click();
    await page.getByPlaceholder('e.g. Saturday Rapid Round Robin').fill('Saturday Rapid');
    await page.getByRole('button', { name: 'Aarav Kumar' }).click();
    await page.getByRole('button', { name: 'Diya Shah' }).click();
    await page.getByRole('button', { name: 'Create & pair round 1' }).click();

    await expect(page.getByText('Board 1')).toBeVisible();
    await expect(page.getByText('Saturday Rapid')).toBeVisible();
    await page.getByLabel('Result for board 1').selectOption('1-0');
    await expect(page.getByRole('button', { name: 'Next round' })).toBeEnabled();
    await page.getByRole('button', { name: 'Next round' }).click();
    await expect(page.getByRole('dialog', { name: 'Start next round?' })).toBeVisible();
    await page.getByRole('button', { name: 'Start next round' }).click();

    const standingsRow = page.locator('table tbody tr').first();
    await expect(standingsRow).toContainText('1');
  });
});
