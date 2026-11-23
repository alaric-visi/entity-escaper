import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the production build (`vite preview`), so
 * they also cover the Content Security Policy injected at build time.
 *
 * Browsers: `npx playwright install chromium` once. To use an existing Chrome
 * instead, set CHROME_PATH (e.g. CHROME_PATH=/usr/bin/google-chrome).
 */
const launchOptions = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /mobile\.spec\.js/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 }, launchOptions },
    },
    {
      name: 'mobile',
      testMatch: /mobile\.spec\.js/,
      use: { ...devices['Pixel 7'], launchOptions },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
