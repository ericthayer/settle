import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from 'vite'

// The app reads VITE_* from .env.local; the test reads the same values to check the database.
Object.assign(process.env, { ...loadEnv('development', process.cwd(), 'VITE_'), ...process.env })

const PRODUCTION_HOST = 'settle-invoices.netlify.app'
const DEV_URL = 'http://localhost:5173'

/** E2E_BASE_URL points the run at a deploy preview; otherwise it starts the Vite dev server. */
const baseURL = process.env.E2E_BASE_URL ?? DEV_URL
if (new URL(baseURL).host === PRODUCTION_HOST) {
  throw new Error('E2E_BASE_URL points at production. Use the dev server or a deploy preview.')
}

/** Cloud dev containers ship Chromium here; CI installs Playwright's own build instead. */
const LOCAL_CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    locale: 'en-US',
    timezoneId: 'UTC',
    // Traces and videos record typed values, including the password. Screenshots only.
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
    launchOptions: existsSync(LOCAL_CHROMIUM) ? { executablePath: LOCAL_CHROMIUM } : {},
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --port 5173 --strictPort',
        url: DEV_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
})
