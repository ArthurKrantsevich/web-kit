"use client";

import { TextCompare } from "@web-kit/text-compare";
import "@web-kit/text-compare/styles.css";

const LEFT = `# Settings
port = 8080
timeout = 30
retries = 3
log_level = info
cache = on
cache_size = 128
region = eu-west
user = admin
theme = light
`;

const RIGHT = `# Settings
port = 8080
timeout = 60
retries = 3
log_level = info
cache = on
cache_size = 128
region = eu-west
user = admin
theme = dark
language = en
`;

export default function TextCompareDemo() {
  return <TextCompare initialLeft={LEFT} initialRight={RIGHT} />;
}
