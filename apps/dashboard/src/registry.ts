import { meta as jsonFormatter } from "./tools/json-formatter/meta";
// generator:meta-imports
import { meta as jsonSchemaValidator } from "./tools/json-schema-validator/meta";
import { meta as jsonDiff } from "./tools/json-diff/meta";
import { meta as jsonConvert } from "./tools/json-convert/meta";

export type Category = "data" | "generators" | "media";

export const CATEGORIES: Category[] = ["data", "generators", "media"];

export const CATEGORY_LABELS: Record<Category, string> = {
  data: "Data",
  generators: "Generators",
  media: "Media",
};

export interface ApiEntry {
  name: string;
  signature: string;
  description: string;
}

/** Plain data only: this module is imported by server and client components. */
export interface ToolMeta {
  id: string;
  title: string;
  description: string;
  /** Up to 5 short lines of plain text shown on the home card. */
  preview: string;
  category: Category;
  tags: string[];
  pkg: string;
  usage: string;
  api: ApiEntry[];
}

export const tools: ToolMeta[] = [
  jsonFormatter,
  // generator:metas
  jsonSchemaValidator,
  jsonDiff,
  jsonConvert,
];

/** A planned utility, shown as a "Soon" card: found by search and category, but not a link (it has no page yet). */
export interface UpcomingTool {
  /** The id its package and page will have. */
  id: string;
  title: string;
  category: Category;
  description: string;
}

export const upcoming: UpcomingTool[] = [
  { id: "base64", title: "Base64", category: "data", description: "Encode and decode Base64 text and files, with correct UTF-8." },
  { id: "url-encoder", title: "URL Encoder", category: "data", description: "Encode and decode URLs and their parts, and take a query string apart." },
  { id: "jwt-decoder", title: "JWT Decoder", category: "data", description: "Read a JWT's header and payload and see when it expires. The signature is not checked." },
  { id: "text-compare", title: "Text Compare", category: "data", description: "Compare two texts or files side by side, by line, word or character, and export a patch." },
  { id: "uuid-generator", title: "UUID Generator", category: "generators", description: "Make v4 and v7 UUIDs, one or many at a time." },
  { id: "password-generator", title: "Password Generator", category: "generators", description: "Strong passwords from a secure random source, with an entropy estimate." },
  { id: "hash-generator", title: "Hash Generator", category: "generators", description: "SHA-1, SHA-256, SHA-384, SHA-512 and MD5 of a text or a file." },
  { id: "qr-generator", title: "QR Code Generator", category: "generators", description: "Turn a text or a link into a QR code and save it as PNG or SVG." },
  { id: "palette-generator", title: "Palette Generator", category: "generators", description: "Build a color palette from one color and check WCAG contrast." },
  { id: "image-converter", title: "Image Converter", category: "media", description: "Convert between PNG, JPG and WebP, resize, and choose the quality." },
  { id: "video-player", title: "Video Player", category: "media", description: "Play a video with speed control, VTT subtitles, keyboard shortcuts and picture-in-picture." },
];

export function getTool(id: string): ToolMeta | undefined {
  return tools.find((tool) => tool.id === id);
}
