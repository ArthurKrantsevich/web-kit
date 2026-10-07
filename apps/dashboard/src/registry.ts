import { meta as jsonFormatter } from "./tools/json-formatter/meta";
// generator:meta-imports
import { meta as uuidGenerator } from "./tools/uuid-generator/meta";
import { meta as passwordGenerator } from "./tools/password-generator/meta";
import { meta as hashGenerator } from "./tools/hash-generator/meta";
import { meta as textCompare } from "./tools/text-compare/meta";
import { meta as jsonSchemaValidator } from "./tools/json-schema-validator/meta";
import { meta as jsonDiff } from "./tools/json-diff/meta";
import { meta as jsonConvert } from "./tools/json-convert/meta";
import { meta as codeScanner } from "./tools/code-scanner/meta";

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
  uuidGenerator,
  passwordGenerator,
  hashGenerator,
  textCompare,
  jsonSchemaValidator,
  jsonDiff,
  jsonConvert,
  codeScanner,
];

/** A planned utility, shown as a "Soon" card: found by search and category, but not a link (it has no page yet). */
export interface UpcomingTool {
  /** The id its package and page will have. */
  id: string;
  title: string;
  category: Category;
  description: string;
  /** 2 to 4 short lines of plain text (at most 28 characters each) showing what the tool will do. */
  preview: string;
}

export const upcoming: UpcomingTool[] = [
  { id: "base64", title: "Base64", category: "data", description: "Encode and decode Base64 text and files, with correct UTF-8.", preview: "hello → aGVsbG8=\nЖ → 0JY=\nlogo.png → iVBORw0KGgo…" },
  { id: "url-encoder", title: "URL Encoder", category: "data", description: "Encode and decode URLs and their parts, and take a query string apart.", preview: "a b&c → a%20b%26c\n?q=json&page=2\n  q     json\n  page  2" },
  { id: "jwt-decoder", title: "JWT Decoder", category: "data", description: "Read a JWT's header and payload and see when it expires. The signature is not checked.", preview: "eyJhbGciOiJIUzI1NiJ9.…\n{ \"alg\": \"HS256\" }\n{ \"sub\": \"42\" }\nexp in 2 h" },
  { id: "qr-generator", title: "QR Code Generator", category: "generators", description: "Turn a text or a link into a QR code and save it as PNG or SVG.", preview: "text   https://example.com\nsize   256 px · level M\n→ qr.png  qr.svg" },
  { id: "palette-generator", title: "Palette Generator", category: "generators", description: "Build a color palette from one color and check WCAG contrast.", preview: "#b5532f  base\n#d98a6a  #f2c4b0\n#7a3520  #3d1a10\n#b5532f on white 4.95:1" },
  { id: "image-converter", title: "Image Converter", category: "media", description: "Convert between PNG, JPG and WebP, resize, and choose the quality.", preview: "photo.png  2.4 MB\n→ webp  q 80  1600 px\n= 0.9 MB  −62%" },
  { id: "video-player", title: "Video Player", category: "media", description: "Play a video with speed control, VTT subtitles, keyboard shortcuts and picture-in-picture.", preview: "▶ 00:42 / 03:10\n1.5×  CC en.vtt  PiP" },
];

export function getTool(id: string): ToolMeta | undefined {
  return tools.find((tool) => tool.id === id);
}
