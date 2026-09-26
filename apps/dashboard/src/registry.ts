import { meta as jsonFormatter } from "./tools/json-formatter/meta";
// generator:meta-imports
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
  jsonConvert,
];

/** Planned utilities shown as "Soon" cards. They have no page and are not searchable. */
export interface UpcomingTool {
  title: string;
  description: string;
}

export const upcoming: UpcomingTool[] = [
  { title: "JSON Diff", description: "Compare two JSON documents." },
  { title: "JSON Schema Validator", description: "Check JSON against a schema." },
];

export function getTool(id: string): ToolMeta | undefined {
  return tools.find((tool) => tool.id === id);
}
