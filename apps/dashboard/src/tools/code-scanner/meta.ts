import type { ToolMeta } from "../../registry";

export const meta: ToolMeta = {
  id: "code-scanner",
  title: "Code Scanner",
  description: "Read QR codes from an image: file, drop or paste, decoded on your device.",
  preview: `codeScanner("…")
// → "…"`,
  category: "media",
  tags: ["code-scanner"],
  pkg: "@web-kit/code-scanner",
  usage: `import { CodeScanner } from "@web-kit/code-scanner";
import "@web-kit/code-scanner/styles.css";

export function Page() {
  return <CodeScanner />;
}`,
  api: [
    {
      name: "codeScanner",
      signature: "codeScanner(input: string): Result<string>",
      description: "Read QR codes from an image: file, drop or paste, decoded on your device.",
    },
    {
      name: "CodeScanner",
      signature: "<CodeScanner initialInput? className? />",
      description: "Ready-made React UI.",
    },
  ],
};
