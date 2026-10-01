// Browser tests run against the real app in Playwright's Firefox build.
// Each test gets a fresh browser profile, so IndexedDB starts empty.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  // 8 parallel Firefoxes overloaded the v1 PC and caused random 5 s timeouts; 4 ran clean.
  workers: 4,
  reporter: 'list',
  // Speed checks measure the app, so they run alone (npm run speed), not beside three
  // other Firefoxes competing for the CPU.
  grepInvert: process.env.SPEED ? undefined : /@speed/,
  use: {
    baseURL: 'http://localhost:8123',
  },
  projects: [
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: 'python3 -m http.server 8123',
    url: 'http://localhost:8123',
    reuseExistingServer: true,
    stderr: 'ignore', // python's request log
  },
});
