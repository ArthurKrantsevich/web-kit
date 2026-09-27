import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { index: "src/index.ts", worker: "src/worker.ts", "worker-client": "src/worker-client.ts" },
  format: "esm",
  platform: "neutral",
  dts: true,
  clean: true,
  fixedExtension: false,
});
