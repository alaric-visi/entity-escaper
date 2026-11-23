/**
 * Regenerates the README screenshots in docs/images/.
 *
 *   npm run screenshots
 *
 * Builds the app, serves it, and captures it in both themes with Playwright.
 * Uses Playwright's Chromium (npx playwright install chromium), or the
 * browser at CHROME_PATH if set.
 */
import { mkdir } from 'node:fs/promises';
import { build, preview } from 'vite';
import { chromium } from '@playwright/test';

const OUT_DIR = 'docs/images';
const SAMPLE = `<a href="/menu?item=crème brûlée&size=large" title='Tom & Jerry'>
  Today's special: "Café" — 50% off!
</a>`;

await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4174, strictPort: true }, logLevel: 'warn' });
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:4174/';

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
);
await mkdir(OUT_DIR, { recursive: true });

try {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 760 },
      deviceScaleFactor: 2,
      colorScheme: theme,
      reducedMotion: 'reduce',
    });
    await page.goto(url);
    await page.fill('#input', SAMPLE);
    await page.click('label[for="view-changes"]');
    await page.screenshot({ path: `${OUT_DIR}/screenshot-${theme}.png`, fullPage: true });
    await page.close();
    console.log(`Saved ${OUT_DIR}/screenshot-${theme}.png`);
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
