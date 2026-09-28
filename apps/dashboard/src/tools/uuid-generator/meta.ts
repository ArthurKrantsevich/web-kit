import type { ToolMeta } from "../../registry";

export const meta: ToolMeta = {
  id: "uuid-generator",
  title: "UUID Generator",
  description: "UUID v1, v3, v4, v5, v6 and v7, ULID and NanoID in bulk, and any of them taken apart.",
  preview: `uuidGenerator("…")
// → "…"`,
  category: "generators",
  tags: ["uuid-generator"],
  pkg: "@web-kit/uuid-generator",
  usage: `import { UuidGenerator } from "@web-kit/uuid-generator";
import "@web-kit/uuid-generator/styles.css";

export function Page() {
  return <UuidGenerator />;
}`,
  api: [
    {
      name: "uuidGenerator",
      signature: "uuidGenerator(input: string): Result<string>",
      description: "UUID v1, v3, v4, v5, v6 and v7, ULID and NanoID in bulk, and any of them taken apart.",
    },
    {
      name: "UuidGenerator",
      signature: "<UuidGenerator initialInput? className? />",
      description: "Ready-made React UI.",
    },
  ],
};
