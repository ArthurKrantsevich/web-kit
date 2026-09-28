import type { ToolMeta } from "../../registry";

export const meta: ToolMeta = {
  id: "hash-generator",
  title: "Hash Generator",
  description: "MD5, SHA-1, SHA-2, SHA-3, BLAKE2, BLAKE3, RIPEMD-160 and CRC32 of a text or a file, with a checksum check and HMAC.",
  preview: `hashGenerator("…")
// → "…"`,
  category: "generators",
  tags: ["hash-generator"],
  pkg: "@web-kit/hash-generator",
  usage: `import { HashGenerator } from "@web-kit/hash-generator";
import "@web-kit/hash-generator/styles.css";

export function Page() {
  return <HashGenerator />;
}`,
  api: [
    {
      name: "hashGenerator",
      signature: "hashGenerator(input: string): Result<string>",
      description: "MD5, SHA-1, SHA-2, SHA-3, BLAKE2, BLAKE3, RIPEMD-160 and CRC32 of a text or a file, with a checksum check and HMAC.",
    },
    {
      name: "HashGenerator",
      signature: "<HashGenerator initialInput? className? />",
      description: "Ready-made React UI.",
    },
  ],
};
