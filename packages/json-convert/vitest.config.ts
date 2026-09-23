import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // TypeScript checks spawn tsc; CI runners are slow.
  test: { environment: "jsdom", testTimeout: 60_000 },
});
