// Browser tests run against the real app in Playwright's Firefox build.
// Each test gets a fresh browser profile, so IndexedDB starts empty.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  // 8 parallel Firefoxes overloaded this PC and caused random 5 s timeouts
  // (2026-10-01); 4 ran 189/189 clean.
  workers: 4,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8123',
  },
  projects: [
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: 'python -m http.server 8123',
    url: 'http://localhost:8123',
    reuseExistingServer: true,
  },
});
