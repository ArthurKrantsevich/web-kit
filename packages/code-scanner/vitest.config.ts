import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // The decoder tests run dozens of real scans each; under the whole-repo gate's parallel tasks they take about three
  // times as long as alone, so the bound is the one the heavier tests already carry. Longer per-test bounds stay.
  test: { environment: "jsdom", testTimeout: 20_000 },
});
