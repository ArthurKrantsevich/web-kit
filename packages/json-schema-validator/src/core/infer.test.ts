import { describe, expect, it } from "vitest";
import { inferSchema } from "./infer";
import { validateSchema } from "./validate";

const HEAD = '{\n  "$schema": "https://json-schema.org/draft/2020-12/schema",\n';

function infer(data: string): string {
  const result = inferSchema(data);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("inferSchema", () => {
  it("describes an object with types, properties and required keys, two-space indented", () => {
    expect(infer('{"name":"Ann","age":30,"admin":false,"note":null}')).toBe(
      `${HEAD}  "type": "object",\n  "properties": {\n    "name": {\n      "type": "string"\n    },\n    "age": {\n      "type": "number"\n    },\n    "admin": {\n      "type": "boolean"\n    },\n    "note": {\n      "type": "null"\n    }\n  },\n  "required": [\n    "name",\n    "age",\n    "admin",\n    "note"\n  ]\n}`,
    );
  });

  it("merges array items like toTypeScript: keys missing somewhere are optional, types are joined", () => {
    expect(infer('[{"id":1,"email":null},{"id":2,"email":"b@x.io","tags":[]}]')).toBe(
      `${HEAD}  "type": "array",\n  "items": {\n    "type": "object",\n    "properties": {\n      "id": {\n        "type": "number"\n      },\n      "email": {\n        "type": [\n          "string",\n          "null"\n        ]\n      },\n      "tags": {\n        "type": "array"\n      }\n    },\n    "required": [\n      "id",\n      "email"\n    ]\n  }\n}`,
    );
  });

  it("handles scalars, empty containers and mixed types", () => {
    expect(infer("42")).toBe(`${HEAD}  "type": "number"\n}`);
    expect(infer("{}")).toBe(`${HEAD}  "type": "object"\n}`);
    expect(infer('[1,"a",[true],{"k":1}]')).toBe(
      `${HEAD}  "type": "array",\n  "items": {\n    "type": [\n      "object",\n      "array",\n      "string",\n      "number"\n    ],\n    "properties": {\n      "k": {\n        "type": "number"\n      }\n    },\n    "required": [\n      "k"\n    ],\n    "items": {\n      "type": "boolean"\n    }\n  }\n}`,
    );
  });

  it("keeps unusual keys as they are and in their order", () => {
    const schema = infer('{"__proto__":1,"2":true,"1":"x","a\\"b":null}');
    expect(schema).toContain('"properties": {\n    "__proto__": {');
    expect(schema.indexOf('"2"')).toBeLessThan(schema.indexOf('"1"'));
    expect(schema).toContain('"a\\"b": {');
  });

  it("returns the parse error for invalid JSON", () => {
    expect(inferSchema("{")).toEqual({ ok: false, error: { message: "Unexpected end of input", offset: 1, line: 1, column: 2 } });
  });

  it("produces a schema its data passes, without warnings", () => {
    for (const data of [
      '{"users":[{"id":1,"name":"Ann","email":null},{"id":2,"name":"Bob","email":"b@x.io","tags":["a"]}],"total":2}',
      '[[1,2],[3,"x"],[]]',
      '"text"',
      '[{"a":{"b":[{"c":1},{"d":2}]}},{"a":{"b":[]}}]',
    ]) {
      expect(validateSchema(data, infer(data))).toEqual({ ok: true, valid: true, errors: [], warnings: [] });
    }
  });
});
