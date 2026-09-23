"use client";

import { JsonConvert } from "@web-kit/json-convert";
import "@web-kit/json-convert/styles.css";

const SAMPLE = '{"users":[{"id":1,"name":"Ann","email":"ann@example.com"},{"id":2,"name":"Bob","email":null}],"total":2}';

export default function JsonConvertDemo() {
  return <JsonConvert initialInput={SAMPLE} />;
}
