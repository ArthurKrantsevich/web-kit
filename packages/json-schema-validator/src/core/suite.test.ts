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
  /**
   * What we do instead of the suite's answer: a schema error with `message` among its problems,
   * "invalid" where the suite expects "valid", or "unchecked": a result with `message` among its warnings that misses the error.
   */
  expect: "schema error" | "invalid" | "unchecked";
  /** The exact problem or warning message we give. */
  message?: string;
  reason: string;
}

const REMOTE = "remote $ref is not supported";
const EMBEDDED = "$ref to a subschema with its own $id is not supported";
const ANCHOR = "$ref to an anchor is not supported";
const UNEVALUATED = "keyword `unevaluatedProperties` is not checked";
const ASSERTED = "these seven formats are asserted, not annotations (plan decision 2)";

const embedded = (group: string): Deviation => ({
  file: "ref.json",
  group,
  expect: "schema error",
  message: EMBEDDED,
  reason: "the $ref targets a subschema of the same document identified by its own (embedded) $id: explicit schema error",
});

/** Cases whose expected answer we knowingly do not give. Each one still runs and must fail in the stated, explicit way. */
const DEVIATIONS: Deviation[] = [
  { file: "ref.json", group: "remote ref, containing refs itself", expect: "schema error", message: REMOTE, reason: "the $ref points to another document (the meta-schema): explicit schema error" },
  embedded("Recursive references between schemas"),
  embedded("refs with relative uris and defs"),
  embedded("relative refs with absolute uris and defs"),
  embedded("$id must be resolved against nearest parent, not just immediate parent"),
  embedded("order of evaluation: $id and $ref"),
  { file: "ref.json", group: "order of evaluation: $id and $anchor and $ref", expect: "schema error", message: ANCHOR, reason: "the $ref points to an $anchor: explicit schema error" },
  embedded("order of evaluation: $id and $ref on nested schema"),
  { file: "ref.json", group: "URN base URI with URN and anchor ref", expect: "schema error", message: ANCHOR, reason: "the $ref points to an $anchor: explicit schema error" },
  embedded("URN ref with nested pointer ref"),
  embedded("ref to if"),
  embedded("ref to then"),
  embedded("ref to else"),
  embedded("ref with absolute-path-reference"),
  {
    file: "ref.json",
    group: "ref creates new scope when adjacent to keywords",
    test: "referenced subschema doesn't see annotations from properties",
    expect: "unchecked",
    message: UNEVALUATED,
    reason: "unevaluatedProperties is not checked (warning), so the extra property is missed",
  },
  {
    file: "not.json",
    group: "collect annotations inside a 'not', even if collection is disabled",
    test: "annotations are still collected inside a 'not'",
    expect: "unchecked",
    message: UNEVALUATED,
    reason: "unevaluatedProperties is not checked (warning), so the extra property is missed",
  },
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
              const messages = (list: { message: string }[]) => list.map((note) => note.message);
              if (deviation.expect === "schema error") {
                if (result.ok || result.stage !== "schema") throw new Error(`expected a schema error: ${JSON.stringify(result)}`);
                expect(messages(result.problems)).toContain(deviation.message);
              } else if (deviation.expect === "unchecked") {
                if (!result.ok) throw new Error(`unexpected ${result.stage} error: ${JSON.stringify(result)}`);
                expect(messages(result.warnings)).toContain(deviation.message);
                expect(result.valid).toBe(true);
              } else expect(result.ok && result.valid).toBe(false);
              return;
            }
            if (!result.ok) throw new Error(`unexpected ${result.stage} error: ${JSON.stringify(result)}`);
            expect(result.valid).toBe(valid);
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
