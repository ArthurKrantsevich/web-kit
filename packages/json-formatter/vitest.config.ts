import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // CI runners are several times slower than a laptop at rendering in jsdom.
  test: { environment: "jsdom", testTimeout: 15_000 },
});
