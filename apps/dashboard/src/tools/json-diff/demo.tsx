"use client";

import { JsonDiff } from "@web-kit/json-diff";
import "@web-kit/json-diff/styles.css";

export default function JsonDiffDemo() {
  return (
    <JsonDiff
      initialLeft='{"name":"web-kit","version":"1.0.0","tools":["formatter","convert"],"stable":true}'
      initialRight='{"name":"web-kit","version":"1.1.0","tools":["formatter","convert","diff"],"license":"MIT"}'
    />
  );
}
