import { meta as jsonFormatter } from "./tools/json-formatter/meta";
// generator:meta-imports
import { meta as jsonConvert } from "./tools/json-convert/meta";

export type Category = "data" | "generators" | "media";

export const CATEGORIES: Category[] = ["data", "generators", "media"];

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

export function getTool(id: string): ToolMeta | undefined {
  return tools.find((tool) => tool.id === id);
}
