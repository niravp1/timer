import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: '*.e2e.ts',
  use: { baseURL: 'http://127.0.0.1:4173', timezoneId: 'America/New_York' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
  ],
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173' },
})
