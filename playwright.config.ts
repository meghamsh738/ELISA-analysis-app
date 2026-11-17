import { defineConfig, devices } from '@playwright/test'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Use the shared Next-only browser cache and reject a path redirected through a symlink.
const require = createRequire(import.meta.url)
const { assertNoSymlinkDirectoryComponents, resolvePlaywrightBrowserRoot } = require('./electron/next-runtime.cjs')
process.env.PLAYWRIGHT_BROWSERS_PATH = assertNoSymlinkDirectoryComponents(
  resolvePlaywrightBrowserRoot(__dirname),
)

const url = 'http://127.0.0.1:18514'

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  fullyParallel: true,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { animations: 'disabled', caret: 'hide' },
  },
  use: {
    baseURL: url,
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev:e2e',
    url,
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
