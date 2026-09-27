import { defineConfig } from "vitest/config";

// Unit tests of the dashboard's plain modules. e2e/*.spec.ts belong to Playwright.
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
