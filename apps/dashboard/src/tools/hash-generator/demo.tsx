"use client";

import { HashGenerator } from "@web-kit/hash-generator";
import "@web-kit/hash-generator/styles.css";

export default function HashGeneratorDemo() {
  return <HashGenerator initialSettings={{ text: "hello" }} />;
}
