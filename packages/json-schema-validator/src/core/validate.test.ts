import { describe, expect, it } from "vitest";
import type { SchemaResult } from "./types";
import { summarizeSchemaResult, validateSchema } from "./validate";

/** Messages of a checked result; fails the test on a parse or schema error. */
function messages(data: string, schema: string): string[] {
  const result = validateSchema(data, schema);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.errors.map((error) => error.message);
}

function problems(schema: string): string[] {
  const result = validateSchema("1", schema);
  if (result.ok || result.stage !== "schema") throw new Error(JSON.stringify(result));
  return result.problems.map((problem) => `${problem.schemaPath}: ${problem.message}`);
}

describe("validateSchema", () => {
  it("reports each error with data path, schema path, message and positions in both texts", () => {
    const result = validateSchema(
      '{\n  "name": 5,\n  "age": -1\n}',
      '{"type":"object","properties":{"name":{"type":"string"},"age":{"minimum":0}},"required":["name","email"]}',
    );
    expect(result).toEqual({
      ok: true,
      valid: false,
      warnings: [],
      errors: [
        {
          message: 'Missing required property "email"',
          keyword: "required",
          dataPath: [],
          schemaPath: "#/required",
          data: { offset: 0, end: 1, line: 1, column: 1 },
          schema: { offset: 77, end: 104, line: 1, column: 78 },
        },
        {
          message: "Expected string, got number",
          keyword: "type",
          dataPath: ["name"],
          schemaPath: "#/properties/name/type",
          data: { offset: 12, end: 13, line: 2, column: 11 },
          schema: { offset: 39, end: 54, line: 1, column: 40 },
        },
        {
          message: "Expected at least 0, got -1",
          keyword: "minimum",
          dataPath: ["age"],
          schemaPath: "#/properties/age/minimum",
          data: { offset: 24, end: 26, line: 3, column: 10 },
          schema: { offset: 63, end: 74, line: 1, column: 64 },
        },
      ],
    });
  });

  it("counts columns in code points and offsets without a BOM", () => {
    const [emoji] = (validateSchema('["😀", 1]', '{"items":{"type":"string"}}') as Extract<SchemaResult, { ok: true }>).errors;
    expect(emoji!.data).toEqual({ offset: 7, end: 8, line: 1, column: 7 });
    const [bom] = (validateSchema('\uFEFF{"a":1}', '{"properties":{"a":{"type":"string"}}}') as Extract<SchemaResult, { ok: true }>).errors;
    expect(bom!.data).toEqual({ offset: 5, end: 6, line: 1, column: 6 });
  });

  it("compares numbers exactly, never through Number()", () => {
    expect(messages("12345678901234567891", '{"maximum":12345678901234567890}')).toEqual([
      "Expected at most 12345678901234567890, got 12345678901234567891",
    ]);
    expect(messages("[19.99, 0.075, 1.0]", '{"items":{"multipleOf":0.01}}')).toEqual(["Expected a multiple of 0.01, got 0.075"]);
    expect(messages("[1.0, 1e2, 2.5]", '{"items":{"type":"integer"}}')).toEqual(["Expected integer, got number"]);
    expect(messages("[5, 4.99]", '{"items":{"exclusiveMinimum":5}}')).toEqual([
      "Expected more than 5, got 5",
      "Expected more than 5, got 4.99",
    ]);
    expect(messages("[1e308]", '{"items":{"exclusiveMaximum":1e309,"multipleOf":0.5}}')).toEqual([]);
  });

  it("compares enum, const and uniqueItems by value, ignoring key order", () => {
    expect(messages('{"a":[1.0,2]}', '{"enum":[1,{"a":[1,2]}]}')).toEqual([]);
    expect(messages('"x"', '{"enum":["a","b"]}')).toEqual(['Expected one of: "a", "b"']);
    expect(messages('{"b":2,"a":1}', '{"const":{"a":1,"b":2.0}}')).toEqual([]);
    expect(messages("[1, 1.0]", '{"uniqueItems":true}')).toEqual(["Item 1 equals item 0"]);
    expect(messages('[{"a":1,"b":2},{"b":2,"a":1.0}]', '{"uniqueItems":true}')).toEqual(["Item 1 equals item 0"]);
    expect(messages("[0, false, null]", '{"uniqueItems":true}')).toEqual([]);
  });

  it("counts string length in code points and runs patterns with the u flag", () => {
    expect(messages('"😀😀"', '{"minLength":2,"maxLength":1}')).toEqual(["Expected at most 1 character, got 2"]);
    expect(messages('["Äb", "äb"]', '{"items":{"pattern":"^\\\\p{Lu}"}}')).toEqual(["Does not match the pattern ^\\p{Lu}"]);
  });

  it("checks objects: properties, patternProperties, additionalProperties, sizes", () => {
    const schema =
      '{"properties":{"a":{"type":"number"}},"patternProperties":{"^x-":{"type":"string"}},"additionalProperties":false,"minProperties":2,"maxProperties":3}';
    expect(messages('{"a":1,"x-b":"ok"}', schema)).toEqual([]);
    expect(messages('{"a":1,"x-b":2,"c":true,"d":null}', schema)).toEqual([
      "Expected at most 3 properties, got 4",
      "Expected string, got number",
      'Property "c" is not allowed',
      'Property "d" is not allowed',
    ]);
    expect(messages("{}", schema)).toEqual(["Expected at least 2 properties, got 0"]);
  });

  it("selects the whole member of a property that is not allowed", () => {
    const result = validateSchema('{"a":1,"x":true}', '{"properties":{"a":{}},"additionalProperties":false}');
    if (!result.ok) throw new Error("schema");
    expect(result.errors[0]).toMatchObject({ dataPath: ["x"], schemaPath: "#/additionalProperties", data: { offset: 7, end: 15 } });
  });

  it("checks arrays: prefixItems, items, sizes, contains with min and max", () => {
    const tuple = '{"prefixItems":[{"type":"string"}],"items":false}';
    expect(messages('["a"]', tuple)).toEqual([]);
    expect(messages('["a", 1, 2]', tuple)).toEqual(["Expected at most 1 item, got 3"]);
    expect(messages("[1,2,3]", '{"minItems":4,"maxItems":1}')).toEqual(["Expected at least 4 items, got 3", "Expected at most 1 item, got 3"]);
    expect(messages("[1,2,3]", '{"contains":{"type":"string"}}')).toEqual(["No item matches the schema in contains"]);
    expect(messages("[1,2,3]", '{"contains":{"type":"integer"},"maxContains":2}')).toEqual([
      "Expected at most 2 items matching contains, got 3",
    ]);
    expect(messages("[]", '{"contains":{"type":"integer"},"minContains":0}')).toEqual([]);
  });

  it("combines schemas: allOf, anyOf, oneOf, not, if/then/else", () => {
    expect(messages("5", '{"allOf":[{"minimum":6},{"maximum":4}]}')).toEqual(["Expected at least 6, got 5", "Expected at most 4, got 5"]);
    expect(messages('"x"', '{"anyOf":[{"type":"integer"},{"type":"null"}]}')).toEqual(["Does not match any schema in anyOf"]);
    expect(messages("5", '{"oneOf":[{"type":"integer"},{"minimum":0}]}')).toEqual([
      "Matches 2 schemas in oneOf (0, 1); exactly one is allowed",
    ]);
    expect(messages('"x"', '{"oneOf":[{"type":"integer"},{"minimum":0}]}')).toEqual([]);
    expect(messages("1", '{"not":{"type":"integer"}}')).toEqual(["Must not match the schema in not"]);
    const conditional =
      '{"if":{"properties":{"kind":{"const":"a"}}},"then":{"required":["a"]},"else":{"properties":{"n":{"type":"string"}}}}';
    expect(messages('{"kind":"a"}', conditional)).toEqual(['Missing required property "a"']);
    expect(messages('{"kind":"b","n":1}', conditional)).toEqual(["Expected string, got number"]);
  });

  it("follows $ref to #, #/$defs and #/definitions with escaped and percent-encoded tokens", () => {
    const schema =
      '{"$defs":{"a/b":{"type":"integer"},"c~d":{"type":"string"},"e f":{"type":"integer"}},"definitions":{"g":{"type":"boolean"}},' +
      '"properties":{"a":{"$ref":"#/$defs/a~1b"},"b":{"$ref":"#/$defs/c~0d"},"c":{"$ref":"#/$defs/e%20f"},"d":{"$ref":"#/definitions/g"},"self":{"$ref":"#"}}}';
    expect(messages('{"a":1,"b":"x","c":2,"d":true,"self":{"a":2}}', schema)).toEqual([]);
    const result = validateSchema('{"c":2.5,"self":{"d":0}}', schema);
    if (!result.ok) throw new Error("schema");
    expect(result.errors.map((error) => [error.dataPath, error.schemaPath])).toEqual([
      [["c"], "#/$defs/e f/type"],
      [["self", "d"], "#/definitions/g/type"],
    ]);
  });

  it("percent-decodes the whole $ref fragment before splitting it (RFC 6901 §6)", () => {
    const schema = '{"$defs":{"a":{"b":{"type":"integer"}},"a/b":{"type":"string"}},"$ref":"#/$defs/a%2Fb"}';
    expect(messages('"x"', schema)).toEqual(["Expected integer, got string"]);
  });

  it("refuses a $ref to a place that holds no schema", () => {
    const refTo = (pointer: string) =>
      `{"properties":{"x":{"enum":[{"type":"string"}]},"y":{"const":{}},"z":{"default":{}},"w":{"examples":[{}]},"v":{"required":["a"]}},"$ref":"${pointer}"}`;
    for (const pointer of ["#/properties", "#/properties/x/enum/0", "#/properties/y/const", "#/properties/z/default", "#/properties/w/examples/0"]) {
      expect([pointer, problems(refTo(pointer))]).toEqual([pointer, [`#/$ref: $ref points to a value that is not a schema: ${pointer}`]]);
    }
    expect(problems(refTo("#/properties/v/required"))).toEqual([
      "#/$ref: $ref points to a value that is not a schema: #/properties/v/required",
    ]);
  });

  it("still follows a $ref into subschemas and into the value of an unknown keyword", () => {
    const schema =
      '{"x-lib":{"n":{"type":"number"}},"$defs":{"list":{"items":{"type":"string"},"allOf":[{"minimum":1}]}},' +
      '"properties":{"a":{"$ref":"#/x-lib/n"},"b":{"$ref":"#/$defs/list/items"},"c":{"$ref":"#/$defs/list/allOf/0"}}}';
    const result = validateSchema('{"a":"s","b":1,"c":0}', schema);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.errors.map((error) => error.message)).toEqual([
      "Expected number, got string",
      "Expected string, got number",
      "Expected at least 1, got 0",
    ]);
  });

  it("stops a schema that is too expensive to check instead of freezing", () => {
    const defs: string[] = [];
    for (let i = 0; i < 30; i++) defs.push(`"d${i}":{"allOf":[{"$ref":"#/$defs/d${i + 1}"},{"$ref":"#/$defs/d${i + 1}"}]}`);
    defs.push('"d30":{"type":"integer"}');
    const schema = `{"$defs":{${defs.join(",")}},"$ref":"#/$defs/d0"}`;
    const started = Date.now();
    const result = validateSchema("1", schema);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(result.ok ? "checked" : result.stage === "schema" ? result.problems.map((p) => [p.schemaPath, p.message]) : "parse").toEqual([
      ["#", "The schema is too expensive to check"],
    ]);
  });

  it("validates recursive data through a recursive schema", () => {
    const tree = '{"$defs":{"node":{"type":"object","properties":{"children":{"type":"array","items":{"$ref":"#/$defs/node"}}},"required":["id"]}},"$ref":"#/$defs/node"}';
    expect(messages('{"id":1,"children":[{"id":2,"children":[{"id":3}]}]}', tree)).toEqual([]);
    expect(messages('{"id":1,"children":[{"children":[]}]}', tree)).toEqual(['Missing required property "id"']);
  });

  it("stops at a $ref loop that never reaches the data", () => {
    expect(problems('{"$ref":"#"}')).toEqual(["#/$ref: $ref leads back to itself without checking any data"]);
    expect(problems('{"$defs":{"a":{"$ref":"#/$defs/b"},"b":{"$ref":"#/$defs/a"}},"$ref":"#/$defs/a"}')).toEqual([
      "#/$defs/b/$ref: $ref leads back to itself without checking any data",
    ]);
  });

  it("refuses remote and anchor $refs and $refs to nothing", () => {
    expect(problems('{"properties":{"x":{"$ref":"https://example.com/s.json"}}}')).toEqual([
      "#/properties/x/$ref: remote $ref is not supported",
    ]);
    expect(problems('{"$ref":"other.json#/a"}')).toEqual(["#/$ref: remote $ref is not supported"]);
    expect(problems('{"$ref":"#top"}')).toEqual(["#/$ref: $ref to an anchor is not supported"]);
    expect(problems('{"$ref":"#/$defs/nope"}')).toEqual(["#/$ref: $ref points to nothing: #/$defs/nope"]);
    expect(problems('{"$defs":{"a":{"$id":"a.json","$ref":"#/$defs/b"}}}')).toEqual([
      "#/$defs/a/$ref: $ref inside a subschema with its own $id is not supported",
    ]);
  });

  it("tells a $ref to a subschema with its own $id apart from a remote $ref", () => {
    const schema = (ref: string) =>
      `{"$id":"https://example.com/root.json","$defs":{"n":{"$id":"num.json","type":"number"}},"properties":{"x":{"$ref":"${ref}"}}}`;
    for (const ref of ["num.json", "https://example.com/num.json", "/num.json#/type"]) {
      expect(problems(schema(ref))).toEqual(["#/properties/x/$ref: $ref to a subschema with its own $id is not supported"]);
    }
    expect(problems(schema("other.json"))).toEqual(["#/properties/x/$ref: remote $ref is not supported"]);
    expect(problems('{"$ref":"urn:example:a","$defs":{"a":{"$id":"urn:example:a"}}}')).toEqual([
      "#/$ref: $ref to a subschema with its own $id is not supported",
    ]);
  });

  it("accepts a $ref by the root $id", () => {
    expect(messages('"x"', '{"$id":"https://example.com/root.json","$defs":{"n":{"type":"number"}},"$ref":"https://example.com/root.json#/$defs/n"}')).toEqual([
      "Expected number, got string",
    ]);
  });

  it("reports a pattern that does not compile and malformed keywords", () => {
    expect(problems('{"pattern":"("}')).toEqual(["#/pattern: pattern is not a valid regular expression: Invalid regular expression: /(/u: Unterminated group"]);
    expect(problems('{"type":"strng","minLength":-1,"required":"a","items":[{}],"properties":{"a":5},"multipleOf":0}')).toEqual([
      "#/type: type must be a type name or an array of type names",
      "#/minLength: minLength must be a non-negative integer",
      "#/required: required must be an array of strings",
      "#/items: items must be a schema; for a list of schemas use prefixItems (draft 2020-12)",
      "#/properties/a: A schema must be an object or a boolean",
      "#/multipleOf: multipleOf must be a number greater than 0",
    ]);
    expect(problems('{"contains":{},"minContains":-1,"maxItems":2.0}')).toEqual(["#/minContains: minContains must be a non-negative integer"]);
  });

  it("warns about keywords it does not check, with their schema path", () => {
    const result = validateSchema('{"long":1}', '{"type":"object","propertyNames":{"maxLength":3}}');
    expect(result).toEqual({
      ok: true,
      valid: true,
      errors: [],
      warnings: [
        {
          keyword: "propertyNames",
          schemaPath: "#/propertyNames",
          message: "keyword `propertyNames` is not checked",
          schema: { offset: 17, end: 48, line: 1, column: 18 },
        },
      ],
    });
    expect(summarizeSchemaResult(result)).toBe("Valid, but 1 keyword was not checked");
  });

  it("does not turn an unchecked keyword into an error inside not, oneOf or if", () => {
    expect(messages('{"a":1}', '{"not":{"dependentRequired":{"a":["b"]}}}')).toEqual([]);
    expect(messages("1", '{"oneOf":[{"type":"integer"},{"propertyNames":false}]}')).toEqual([]);
    expect(messages("1", '{"if":{"x-custom":true},"then":{"type":"string"}}')).toEqual([]);
    expect(messages('"a"', '{"not":{"x-custom":true,"type":"string"}}')).toEqual([]);
    expect(messages("1", '{"not":{"x-custom":true,"type":"string"}}')).toEqual([]);
  });

  it("accepts annotations without warnings and warns about other drafts", () => {
    const annotated =
      '{"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://example.com/s","$comment":"c","title":"T","description":"D","default":1,"examples":[1],"deprecated":false,"readOnly":true}';
    expect(validateSchema("1", annotated)).toEqual({ ok: true, valid: true, errors: [], warnings: [] });
    const result = validateSchema("{}", '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object"}');
    expect(result.ok && result.warnings.map((warning) => warning.message)).toEqual([
      "keyword `$schema` is not checked: only draft 2020-12 is supported",
    ]);
  });

  it("checks the formats it knows and warns about the others", () => {
    const schema =
      '{"prefixItems":[{"format":"email"},{"format":"uri"},{"format":"date"},{"format":"date-time"},{"format":"uuid"},{"format":"ipv4"},{"format":"ipv6"}],"items":{"format":"hostname"}}';
    const good = '["a.b@example.com","https://example.com/a?b#c","2024-02-29","2024-01-31T23:59:60Z","123e4567-e89b-12d3-a456-426614174000","192.168.0.1","::ffff:192.0.2.1"]';
    const goodResult = validateSchema(good, schema);
    expect(goodResult.ok && [goodResult.valid, goodResult.warnings.map((w) => w.message)]).toEqual([true, ["format `hostname` is not checked"]]);
    expect(messages('["a@@b","/relative","2023-02-29","2024-01-31T12:00:60Z","123e4567","256.0.0.1","1::2::3",1]', schema)).toEqual([
      "Expected an email address",
      "Expected an absolute URI",
      "Expected a date like 2024-01-31",
      "Expected a date-time like 2024-01-31T12:00:00Z",
      "Expected a UUID",
      "Expected an IPv4 address",
      "Expected an IPv6 address",
    ]);
  });

  it("handles boolean schemas and duplicate keys (the last one wins)", () => {
    expect(messages("1", "true")).toEqual([]);
    expect(messages("1", "false")).toEqual(["No value is allowed here"]);
    expect(messages('{"a":1,"a":"x"}', '{"properties":{"a":{"type":"string"}}}')).toEqual([]);
  });

  it("names the input of each parse error", () => {
    expect(validateSchema("{", "[")).toEqual({
      ok: false,
      stage: "parse",
      parseErrors: [
        { input: "data", error: { message: "Unexpected end of input", offset: 1, line: 1, column: 2 } },
        { input: "schema", error: { message: "Unexpected end of input", offset: 1, line: 1, column: 2 } },
      ],
    });
  });
});

describe("summarizeSchemaResult", () => {
  it("never calls a result with warnings plainly valid", () => {
    const summary = (data: string, schema: string) => summarizeSchemaResult(validateSchema(data, schema));
    expect(summary("1", '{"type":"integer"}')).toBe("Valid");
    expect(summary("1", '{"x-a":1,"x-b":2}')).toBe("Valid, but 2 keywords were not checked");
    expect(summary('"a"', '{"type":"integer","x-a":1}')).toBe("Not valid: 1 error; 1 keyword was not checked");
    expect(summary('"a"', '{"type":"integer","minimum":1}')).toBe("Not valid: 1 error");
    expect(summary("{", "{}")).toBe("Data is not valid JSON");
    expect(summary("{", "[")).toBe("Data is not valid JSON · Schema is not valid JSON");
    expect(summary("1", '{"$ref":"https://x"}')).toBe("The schema has 1 error; the data was not checked");
  });
});
