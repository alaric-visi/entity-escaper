import { test, expect, chooseFormat } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('fits the screen without sideways scrolling', async ({ page }) => {
  await page.click('#options-panel summary');
  await page.fill(
    '#input',
    'https://example.com/a-very-long-path/that/keeps/going?and=going&and=going',
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('stacks input above output', async ({ page }) => {
  const input = await page.locator('#input').boundingBox();
  const output = await page.locator('#output').boundingBox();
  expect(output.y).toBeGreaterThan(input.y + input.height);
});

test('hides keyboard shortcuts on touch-only devices', async ({ page }) => {
  await expect(page.locator('#shortcuts-trigger')).toBeHidden();
});

test('works by touch', async ({ page }) => {
  await chooseFormat(page, 'url');
  await page.fill('#input', 'café menu');
  await expect(page.locator('#output')).toHaveValue('caf%C3%A9%20menu');
  await page.locator('#swap-btn').tap();
  await expect(page.locator('#output')).toHaveValue('café menu');
});
