import AxeBuilder from '@axe-core/playwright';
import { test, expect, chooseFormat, chooseRadio } from './fixtures.js';

/**
 * Automated accessibility checks (WCAG 2.2 A and AA rules that axe can test)
 * in both themes and in the app's main states. Automated checks catch about
 * a third of issues; see CONTRIBUTING.md for the manual checks.
 */

/** @param {import('@playwright/test').Page} page */
async function scan(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    // The sandboxed preview can't have scripts injected, and its content is user-supplied.
    .exclude('#preview-frame')
    .analyze();
  return results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target).join(', ')})`,
  );
}

for (const colorScheme of /** @type {const} */ (['dark', 'light'])) {
  test.describe(`${colorScheme} theme`, () => {
    // Reduced motion turns off colour transitions, so contrast is measured on
    // final colours rather than half-way through a fade.
    test.use({ colorScheme, reducedMotion: 'reduce' });

    test('default state', async ({ page }) => {
      await page.goto('/');
      expect(await scan(page)).toEqual([]);
    });

    test('options open, warning notice and highlighted changes', async ({ page }) => {
      await page.goto('/');
      await page.click('#options-panel summary');
      await page.fill('#input', 'Fish &amp; chips <b>');
      await expect(page.locator('#encoded-notice')).toBeVisible();
      await chooseRadio(page, 'view-changes');
      expect(await scan(page)).toEqual([]);
    });

    test('error and warning messages', async ({ page }) => {
      await page.goto('/');
      await chooseFormat(page, 'url');
      await chooseRadio(page, 'direction-decode');
      await page.fill('#input', 'caf%C3%A9 %E0%A4');
      await expect(page.locator('.problem--warning')).toBeVisible();
      expect(await scan(page)).toEqual([]);

      await chooseFormat(page, 'base64');
      await page.fill('#input', 'not base64!');
      await expect(page.locator('.problem--error')).toBeVisible();
      expect(await scan(page)).toEqual([]);
    });

    test('keyboard shortcuts dialog', async ({ page }) => {
      await page.goto('/');
      await page.click('#shortcuts-trigger');
      await expect(page.locator('#shortcuts')).toBeVisible();
      expect(await scan(page)).toEqual([]);
    });
  });
}
