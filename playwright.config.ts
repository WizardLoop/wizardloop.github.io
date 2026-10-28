import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4322';
const windowsChromium = join(
  homedir(),
  'AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
);
const chromiumExecutable =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  (process.platform === 'win32' && existsSync(windowsChromium)
    ? windowsChromium
    : undefined);
const browserSmoke = /@smoke|@keyboard|@preferences|@privacy|@profile|@motion/;

export default defineConfig({
  testDir: './tests',
  testMatch: 'site.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : 1,
  outputDir: 'artifacts/final/test-results',
  reporter: [
    ['list'],
    ['json', { outputFile: 'artifacts/final/playwright-results.json' }],
    [
      'html',
      { outputFolder: 'artifacts/final/playwright-report', open: 'never' },
    ],
  ],
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'light',
    reducedMotion: 'no-preference',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      grepInvert: /@windows-native/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
        launchOptions: chromiumExecutable
          ? { executablePath: chromiumExecutable }
          : {},
      },
    },
    {
      name: 'firefox',
      grep: browserSmoke,
      grepInvert: /@windows-native/,
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'webkit',
      grep: browserSmoke,
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer:
    process.env.PLAYWRIGHT_NO_SERVER === '1'
      ? undefined
      : {
          command:
            process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ||
            'npm run preview -- --host 127.0.0.1 --port 4322',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
});
