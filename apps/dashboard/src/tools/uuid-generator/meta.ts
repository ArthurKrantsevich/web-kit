import type { ToolMeta } from "../../registry";

export const meta: ToolMeta = {
  id: "uuid-generator",
  title: "UUID Generator",
  description: "UUID v1, v3, v4, v5, v6 and v7, ULID and NanoID in bulk, and any of them taken apart.",
  preview: `v7  018f4c2e-7b3a-7c1d-9e2f-…
v7  018f4c2e-7b3a-7c1e-a41b-…
ulid 01HZX3T6K2M8Q4R7…
inspect → 2024-05-09 14:02 UTC`,
  category: "generators",
  tags: ["uuid", "guid", "ulid", "nanoid", "id", "random", "rfc 9562"],
  pkg: "@web-kit/uuid-generator",
  usage: `import { UuidGenerator } from "@web-kit/uuid-generator";
import "@web-kit/uuid-generator/styles.css";

export function Page() {
  return <UuidGenerator />;
}

// Logic only, no React:
import { generateIds, inspectId, uuidV5, uuidV7 } from "@web-kit/uuid-generator/core";

uuidV7(); // "019237c1-e8a0-7d42-8f6b-3c1a2b4d5e6f", strictly increasing on this page
uuidV5("dns", "www.example.com"); // { ok: true, value: "2ed6657d-e927-568b-95e1-2665a8aea6a2" }
generateIds({ kind: "ulid", count: 3 }); // { ok: true, value: [three ULIDs] }
inspectId("017F22E2-79B0-7CC3-98C4-DC0C0C07398F"); // version 7, time 2022-02-22T19:22:22.000Z`,
  api: [
    {
      name: "generateIds",
      signature: 'generateIds({ kind: "v1" | "v3" | "v4" | "v5" | "v6" | "v7" | "nil" | "max" | "ulid" | "nanoid", count?, namespace?, names?, size?, alphabet? }): Result<string[]>',
      description: "One kind of ID, 1 to 1000 at a time; v3 and v5 make one per name. Randomness comes only from crypto.getRandomValues.",
    },
    {
      name: "uuidV4 · uuidV7 · uuidV1 · uuidV6 · ulid",
      signature: "uuidV7(now?): string",
      description: "v7 and ULID strictly increase within a page (a counter, then the next millisecond); v1 and v6 use a random node with the multicast bit set, never a MAC address.",
    },
    {
      name: "uuidV3 · uuidV5",
      signature: 'uuidV5("dns" | "url" | "oid" | "x500" | uuid, name): Result<string>',
      description: "MD5 or SHA-1 of the namespace and the name in UTF-8 (RFC 9562): the same inputs always give the same UUID.",
    },
    {
      name: "nanoid",
      signature: "nanoid({ size?, alphabet? }): Result<string>",
      description: "21 URL-safe characters by default; 2–255 characters from 2–256 different ones, without bias.",
    },
    {
      name: "formatUuid",
      signature: 'formatUuid(id, { case?: "lower" | "upper", hyphens?, wrap?: "none" | "braces" | "urn" }): string',
      description: "A UUID in upper case, without hyphens, in braces or as a URN; a ULID changes only case.",
    },
    {
      name: "inspectId",
      signature: "inspectId(text): Result<IdInfo>",
      description: "Version, variant, time (v1, v6, v7, ULID), clock sequence and node of any UUID spelling or ULID, or why it cannot be read.",
    },
    {
      name: "UuidGenerator",
      signature: "<UuidGenerator initialSettings? className? />",
      description:
        "Ready-made UI: kind, count and format, names for v3 and v5, NanoID size and alphabet, lines or JSON, Copy and Download, Inspect, share link and saved settings (never the IDs), Ctrl+Enter to regenerate.",
    },
  ],
};
