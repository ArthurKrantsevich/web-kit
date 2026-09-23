"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

const demos: Record<string, ComponentType> = {
  "json-formatter": dynamic(() => import("./json-formatter/demo")),
  // generator:demos
};

export function ToolDemo({ id }: { id: string }) {
  const Demo = demos[id];
  return Demo ? <Demo /> : <p>Demo is not available.</p>;
}
