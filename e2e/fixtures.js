import { test as base, expect } from '@playwright/test';

/**
 * `page`, but every test also fails if the app logs an error, throws, or
 * trips the Content Security Policy, unless the test says that message is
 * expected with `consoleProblems.allow(/pattern/)`.
 */
export const test = base.extend({
  consoleProblems: [
    async ({ page }, use) => {
      /** @type {string[]} */
      const seen = [];
      /** @type {RegExp[]} */
      const allowed = [];
      page.on('console', (message) => {
        if (message.type() === 'error' || /Content Security Policy/i.test(message.text())) {
          seen.push(message.text());
        }
      });
      page.on('pageerror', (error) => seen.push(error.message));

      await use({ allow: (/** @type {RegExp} */ pattern) => allowed.push(pattern) });

      const unexpected = seen.filter((text) => !allowed.some((pattern) => pattern.test(text)));
      expect(unexpected, 'console errors or CSP violations').toEqual([]);
    },
    // Runs for every test, whether or not the test asks for it.
    { auto: true },
  ],
});

export { expect };

/**
 * Pick a format from the Format menu.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 */
export async function chooseFormat(page, id) {
  await page.selectOption('#codec-select', id);
}

/**
 * Click the label of a visually hidden radio (as a user would).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 */
export async function chooseRadio(page, id) {
  await page.click(`label[for="${id}"]`);
}
