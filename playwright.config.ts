import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Keep Playwright browser downloads inside the repo so:
// - WSL doesn't try to write to an unwritable global cache path
// - the setup is predictable across machines/CI.
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(__dirname, '.playwright-browsers')

const isWindows = process.platform === 'win32'
const port = 5181
const url = `http://localhost:${port}`
const webServerCommandBase = `npm run dev:e2e -- --port ${port}`
const webServerCommand = isWindows
  ? webServerCommandBase
  : `bash -lc 'set -e; PATH=/usr/bin:/bin:$PATH ${webServerCommandBase}'`

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
    command: webServerCommand,
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
