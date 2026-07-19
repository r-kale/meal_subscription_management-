import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

// Some sandboxes pre-install Chromium at a fixed path; use it when present
// instead of downloading a browser.
const preinstalledChromium = '/opt/pw-browsers/chromium'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 390, height: 844 }, // phone-sized, the primary target
    launchOptions: existsSync(preinstalledChromium) ? { executablePath: preinstalledChromium } : {},
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
})
