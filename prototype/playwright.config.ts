import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "on-first-retry",
  },
  projects: [
    { name: "prototype-desktop", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "prototype-mobile", use: { ...devices["Pixel 5"], channel: "chrome" } },
  ],
  webServer: {
    command: "pnpm exec vite --config prototype/vite.config.ts",
    cwd: "..",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
