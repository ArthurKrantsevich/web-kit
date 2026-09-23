"use client";

import { JsonFormatter } from "@web-kit/json-formatter";
import "@web-kit/json-formatter/styles.css";

export default function JsonFormatterDemo() {
  return <JsonFormatter initialInput='{"hello":"world","list":[1,2,3],"nested":{"ok":true}}' />;
}
