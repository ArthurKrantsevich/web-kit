import type { ToolMeta } from "../../registry";

export const meta: ToolMeta = {
  id: "text-compare",
  title: "Text Compare",
  description: "Compare two texts or files side by side, by line, word or character, and export a patch.",
  preview: `textCompare("…")
// → "…"`,
  category: "data",
  tags: ["text-compare"],
  pkg: "@web-kit/text-compare",
  usage: `import { TextCompare } from "@web-kit/text-compare";
import "@web-kit/text-compare/styles.css";

export function Page() {
  return <TextCompare />;
}`,
  api: [
    {
      name: "textCompare",
      signature: "textCompare(input: string): Result<string>",
      description: "Compare two texts or files side by side, by line, word or character, and export a patch.",
    },
    {
      name: "TextCompare",
      signature: "<TextCompare initialInput? className? />",
      description: "Ready-made React UI.",
    },
  ],
};
