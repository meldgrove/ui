import { defineConfig, devices } from "@playwright/test";

/**
 * Screenshots of the demo page and of the standalone elements. Baselines come
 * from the Playwright container (the same as in CI): npm run test:visual:update.
 */
export default defineConfig({
  testDir: "e2e",
  snapshotPathTemplate: "e2e/snapshots/{testFileName}/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.005, animations: "disabled" } },
  use: {
    baseURL: "http://localhost:5180",
    locale: "en-US",
    timezoneId: "Europe/Berlin",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: "npx vite --config demo/vite.config.ts",
    url: "http://localhost:5180",
    reuseExistingServer: !process.env.CI,
  },
});
