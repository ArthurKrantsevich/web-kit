// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getAt, parseJson, type JsonNode } from "@web-kit/json-core";
import { describe, expect, it } from "vitest";
import { validateSchema } from "./validate";

/** Files copied from JSON-Schema-Test-Suite (see test-suite/README.md), relative to tests/draft2020-12/. */
const FILES = [
  "additionalProperties.json",
  "allOf.json",
  "anyOf.json",
  "boolean_schema.json",
  "const.json",
  "contains.json",
  "default.json",
  "enum.json",
  "exclusiveMaximum.json",
  "exclusiveMinimum.json",
  "format.json",
  "if-then-else.json",
  "infinite-loop-detection.json",
  "items.json",
  "maxContains.json",
  "maxItems.json",
  "maxLength.json",
  "maxProperties.json",
  "maximum.json",
  "minContains.json",
  "minItems.json",
  "minLength.json",
  "minProperties.json",
  "minimum.json",
  "multipleOf.json",
  "not.json",
  "oneOf.json",
  "pattern.json",
  "patternProperties.json",
  "prefixItems.json",
  "properties.json",
  "ref.json",
  "required.json",
  "type.json",
  "uniqueItems.json",
  "optional/bignum.json",
  "optional/ecmascript-regex.json",
  "optional/float-overflow.json",
  "optional/non-bmp-regex.json",
  "optional/format/date-time.json",
  "optional/format/date.json",
  "optional/format/email.json",
  "optional/format/ipv4.json",
  "optional/format/ipv6.json",
  "optional/format/uri.json",
  "optional/format/uuid.json",
];

interface Deviation {
  file: string;
  group: string;
  /** Only this test of the group; all tests when absent. */
  test?: string;
  /** What we do instead of the suite's answer. */
  expect: "schema error" | "invalid";
  reason: string;
}

const EMBEDDED = "$ref resolved against a nested $id (an embedded schema resource) is not supported: explicit schema error";
const ANCHOR = "$ref to an anchor is not supported: explicit schema error";
const ASSERTED = "these seven formats are asserted, not annotations (plan decision 2)";

/** Cases whose expected answer we knowingly do not give. Each one still runs and must fail in the stated, explicit way. */
const DEVIATIONS: Deviation[] = [
  { file: "ref.json", group: "remote ref, containing refs itself", expect: "schema error", reason: "remote $ref is not supported" },
  { file: "ref.json", group: "Recursive references between schemas", expect: "schema error", reason: EMBEDDED },
  { file: "ref.json", group: "refs with relative uris and defs", expect: "schema error", reason: EMBEDDED },
  { file: "ref.json", group: "relative refs with absolute uris and defs", expect: "schema error", reason: EMBEDDED },
  { file: "ref.json", group: "$id must be resolved against nearest parent, not just immediate parent", expect: "schema error", reason: EMBEDDED },
  { file: "ref.json", group: "order of evaluation: $id and $ref", expect: "schema error", reason: EMBEDDED },
  { file: "ref.json", group: "order of evaluation: $id and $anchor and $ref", expect: "schema error", reason: ANCHOR },
  { file: "ref.json", group: "order of evaluation: $id and $ref on nested schema", expect: "schema error", reason: EMBEDDED },
  { file: "ref.json", group: "URN base URI with URN and anchor ref", expect: "schema error", reason: ANCHOR },
  { file: "ref.json", group: "URN ref with nested pointer ref", expect: "schema error", reason: EMBEDDED },
  { file: "ref.json", group: "ref to if", expect: "schema error", reason: EMBEDDED },
  { file: "ref.json", group: "ref to then", expect: "schema error", reason: EMBEDDED },
  { file: "ref.json", group: "ref to else", expect: "schema error", reason: EMBEDDED },
  { file: "ref.json", group: "ref with absolute-path-reference", expect: "schema error", reason: EMBEDDED },
  ...["email", "ipv4", "ipv6", "date", "date-time", "uri", "uuid"].map(
    (format): Deviation => ({
      file: "format.json",
      group: `${format} format`,
      test: `invalid ${format} string is only an annotation by default`,
      expect: "invalid",
      reason: ASSERTED,
    }),
  ),
];

const ROOT = fileURLToPath(new URL("../../test-suite/tests/draft2020-12/", import.meta.url));
const used = new Set<Deviation>();

function field(node: JsonNode, key: string): JsonNode {
  const found = getAt(node, [key]);
  if (!found) throw new Error(`missing "${key}"`);
  return found;
}

const stringOf = (node: JsonNode): string => (node.type === "string" ? node.value : "");

for (const file of FILES) {
  // Schemas and data are taken as text slices, so big and precise numbers keep their spelling.
  const text = readFileSync(ROOT + file, "utf8");
  const parsed = parseJson(text);
  const root = parsed.ok ? parsed.value : null;
  if (root?.type !== "array") throw new Error(`${file} is not a test file`);
  const groups = root.items;
  const slice = (node: JsonNode) => text.slice(node.start, node.end);

  describe(file, () => {
    for (const group of groups) {
      const groupName = stringOf(field(group, "description"));
      const schema = slice(field(group, "schema"));
      const tests = field(group, "tests");
      if (tests.type !== "array") throw new Error(`${file}: ${groupName}: tests is not an array`);
      const cases = tests.items;
      describe(groupName, () => {
        for (const test of cases) {
          const testName = stringOf(field(test, "description"));
          const data = slice(field(test, "data"));
          const expected = field(test, "valid");
          const valid = expected.type === "boolean" && expected.value;
          const deviation = DEVIATIONS.find(
            (d) => d.file === file && d.group === groupName && (d.test === undefined || d.test === testName),
          );
          it(testName, () => {
            const result = validateSchema(data, schema);
            if (deviation) {
              used.add(deviation);
              if (deviation.expect === "schema error") expect(result.ok || result.stage).toBe("schema");
              else expect(result.ok && result.valid).toBe(false);
              return;
            }
            if (!result.ok) throw new Error(`unexpected ${result.stage} error: ${JSON.stringify(result)}`);
            if (result.warnings.length === 0) expect(result.valid).toBe(valid);
            // With unchecked keywords "valid" may miss an error, but a reported error must be real.
            else if (valid) expect(result.valid).toBe(true);
          });
        }
      });
    }
  });
}

describe("deviations", () => {
  it("every deviation matches a case of the suite", () => {
    expect(DEVIATIONS.filter((d) => !used.has(d)).map((d) => `${d.file}: ${d.group}`)).toEqual([]);
  });
});
