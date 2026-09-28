import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { index: "src/index.ts", core: "src/core/index.ts", extra: "src/extra/index.ts", worker: "src/worker.ts" },
  format: "esm",
  platform: "neutral",
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: { neverBundle: ["react", "react/jsx-runtime"] },
});
