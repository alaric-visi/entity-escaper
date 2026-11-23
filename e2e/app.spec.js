import { readFile } from 'node:fs/promises';
import { test, expect, chooseFormat, chooseRadio } from './fixtures.js';

const SAMPLE = `Café & "Tom's" <b>😀</b>\n50% off /a?b=c ]]> \\ \${x}`;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('loads the production build with its security policy', async ({ page }) => {
  await expect(page).toHaveTitle('Entity Escaper');
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  expect(csp).toMatch(/style-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
});

test('every format round-trips through the UI', async ({ page }) => {
  for (const id of ['html', 'url', 'javascript', 'json', 'base64', 'xml']) {
    await chooseFormat(page, id);
    await chooseRadio(page, 'direction-encode');
    await page.fill('#input', SAMPLE);
    const encoded = await page.inputValue('#output');
    expect(encoded, id).not.toBe(SAMPLE);

    await page.click('#swap-btn');
    await expect(page.locator('#direction-decode'), id).toBeChecked();
    await expect(page.locator('#output'), id).toHaveValue(SAMPLE);
  }
});

test('copies with the button and with Ctrl+Enter', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only in Playwright');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());

  await page.fill('#input', '<p>Hi</p>');
  await page.click('#copy-btn');
  await expect(page.locator('#copy-btn')).toHaveText('Copied!');
  expect(await clipboard()).toBe('&lt;p&gt;Hi&lt;/p&gt;');

  await page.fill('#input', 'a & b');
  await page.locator('#input').press('Control+Enter');
  await expect.poll(clipboard).toBe('a &amp; b');
});

test('Ctrl+Shift+Enter swaps', async ({ page }) => {
  await page.fill('#input', '<p>');
  await page.locator('#input').press('Control+Shift+Enter');
  await expect(page.locator('#input')).toHaveValue('&lt;p&gt;');
  await expect(page.locator('#direction-decode')).toBeChecked();
});

test('opens a file with the button', async ({ page }) => {
  await page.setInputFiles('#file-input', {
    name: 'snippet.html',
    mimeType: 'text/html',
    buffer: Buffer.from('<h1>From a file</h1>'),
  });
  await expect(page.locator('#input')).toHaveValue('<h1>From a file</h1>');
  await expect(page.locator('#input-message')).toHaveText(/Opened "snippet.html"/);
});

test('opens a file dropped on the page', async ({ page }) => {
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(['dropped & loaded'], 'drop.txt', { type: 'text/plain' }));
    return data;
  });
  await page.dispatchEvent('main', 'dragover', { dataTransfer: transfer });
  await expect(page.locator('.panel--input')).toHaveClass(/is-drop-target/);
  await page.dispatchEvent('main', 'drop', { dataTransfer: transfer });
  await expect(page.locator('#input')).toHaveValue('dropped & loaded');
  await expect(page.locator('#output')).toHaveValue('dropped &amp; loaded');
  await expect(page.locator('.panel--input')).not.toHaveClass(/is-drop-target/);
});

test('downloads the output as a text file', async ({ page }) => {
  await chooseFormat(page, 'base64');
  await page.fill('#input', 'Hello, world!');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#download-btn'),
  ]);
  expect(download.suggestedFilename()).toBe('output-base64-encoded.txt');
  expect(await readFile(await download.path(), 'utf8')).toBe('SGVsbG8sIHdvcmxkIQ==');
});

test('the preview renders markup but blocks scripts and network requests', async ({
  page,
  consoleProblems,
}) => {
  // These are the browser reporting that the sandbox and CSP did their job.
  consoleProblems.allow(/Blocked script execution in 'about:srcdoc'/);
  // The frame has its own CSP and inherits the page's; either may report the blocked image.
  consoleProblems.allow(
    /Loading the image .* violates the following Content Security Policy directive: "img-src/,
  );

  const dialogs = [];
  const external = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    dialog.dismiss();
  });
  page.on('request', (request) => {
    if (!request.url().startsWith('http://localhost')) external.push(request.url());
  });

  await chooseRadio(page, 'direction-decode');
  await page.fill(
    '#input',
    '&lt;img src="https://example.com/pixel.gif" onerror="alert(1)"&gt;' +
      '&lt;script&gt;alert(2)&lt;/script&gt;&lt;h2&gt;Rendered&lt;/h2&gt;',
  );
  await chooseRadio(page, 'view-preview');
  const frame = page.frameLocator('#preview-frame');
  await expect(frame.locator('h2')).toHaveText('Rendered');
  await page.waitForTimeout(500);
  expect(dialogs).toEqual([]);
  expect(external).toEqual([]);
});

test('highlights changes', async ({ page }) => {
  await page.fill('#input', 'a<b>c');
  await chooseRadio(page, 'view-changes');
  await expect(page.locator('#output-changes mark')).toHaveText(['&lt;', '&gt;']);
});

test('shows a clear error for invalid input', async ({ page }) => {
  await chooseFormat(page, 'json');
  await chooseRadio(page, 'direction-decode');
  await page.fill('#input', 'bad " quote');
  await expect(page.locator('.problem--error')).toHaveText(/Unescaped " at position 5/);
  await expect(page.locator('#copy-btn')).toBeDisabled();
});

test('remembers format, options, theme and text across reloads', async ({ page }) => {
  await page.selectOption('#theme-select', 'light');
  await chooseFormat(page, 'url');
  await page.click('#options-panel summary');
  await page.selectOption('[data-option-id="variant"]', 'form');
  await page.fill('#input', 'a b');
  await page.waitForTimeout(400); // saves are debounced

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#codec-select')).toHaveValue('url');
  await expect(page.locator('[data-option-id="variant"]')).toHaveValue('form');
  await expect(page.locator('#output')).toHaveValue('a+b');
});

test('puts input and output side by side on wide screens', async ({ page }) => {
  const input = await page.locator('#input').boundingBox();
  const output = await page.locator('#output').boundingBox();
  expect(output.x).toBeGreaterThan(input.x + input.width);
  expect(Math.abs(output.y - input.y)).toBeLessThan(60);
});

test('can be used with the keyboard alone', async ({ page }) => {
  // Tab order through the main controls.
  const order = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    order.push(
      await page.evaluate(() => {
        const el = document.activeElement;
        return el.id || el.closest('[id]')?.id || el.tagName;
      }),
    );
  }
  expect(order).toEqual([
    'theme-select',
    'shortcuts-trigger',
    'codec-select',
    'direction-encode',
    'options-panel',
    'open-file-btn',
    'input',
    'swap-btn',
  ]);

  // Change direction with the arrow keys, type, and copy with the keyboard.
  await page.focus('#direction-encode');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#direction-decode')).toBeChecked();
  await page.focus('#input');
  await page.keyboard.type('&lt;ok&gt;');
  await expect(page.locator('#output')).toHaveValue('<ok>');

  // The shortcuts popover opens and closes from the keyboard.
  await page.focus('#shortcuts-trigger');
  await page.keyboard.press('Enter');
  await expect(page.locator('#shortcuts')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#shortcuts')).toBeHidden();
});
