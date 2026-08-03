import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 2 : 0,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], channel: "chromium" },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 5"], channel: "chromium" },
    },
  ],
  webServer: [
    {
      command: "node scripts/start-e2e-api.mjs",
      url: "http://localhost:8788/api/v1/health",
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: "pnpm dev --mode e2e --host 127.0.0.1",
      url: "http://localhost:5173",
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
