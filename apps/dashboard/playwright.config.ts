import { defineConfig, devices } from "@playwright/test";

// PORT lets a second checkout run its e2e next to another one; the default stays 4173.
const PORT = Number(process.env.PORT ?? 4173);
const BASE = `http://localhost:${PORT}/web-kit/`;

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/serve-out.mjs",
    url: BASE,
    reuseExistingServer: !process.env.CI,
  },
});
