import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  fullyParallel: true,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { animations: 'disabled', caret: 'hide' },
  },
  use: {
    baseURL: 'http://localhost:5180',
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
    video: 'retain-on-failure',
  },
  webServer: {
    command: "bash -lc 'set -e; PATH=/usr/bin:/bin:$PATH npm run dev'",
    url: 'http://localhost:5180',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chromium'],
        viewport: { width: 1440, height: 900 },
        colorScheme: 'light',
        reducedMotion: 'reduce',
      },
    },
  ],
})

