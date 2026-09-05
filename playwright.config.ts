import { defineConfig, devices } from "@playwright/test"

/**
 * Configured in T1; wired into the CI gate in T9 (E2E & release gate).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // CI needs the failing steps in the job log — the html reporter alone
  // prints nothing a CircleCI step could show. Locally the html report is
  // the better surface and opens itself.
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    // The command is a full production build plus boot; a cold CI container
    // needs more headroom than a warm laptop.
    timeout: 240_000,
  },
})
