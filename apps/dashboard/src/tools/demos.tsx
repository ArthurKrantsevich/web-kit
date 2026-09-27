"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

const demos: Record<string, ComponentType> = {
  "json-formatter": dynamic(() => import("./json-formatter/demo")),
  // generator:demos
  "text-compare": dynamic(() => import("./text-compare/demo")),
  "json-schema-validator": dynamic(() => import("./json-schema-validator/demo")),
  "json-diff": dynamic(() => import("./json-diff/demo")),
  "json-convert": dynamic(() => import("./json-convert/demo")),
};

export function ToolDemo({ id }: { id: string }) {
  const Demo = demos[id];
  return Demo ? <Demo /> : <p>Demo is not available.</p>;
}
