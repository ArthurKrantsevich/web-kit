import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { toTypeScript } from "./typescript";

const TSC = resolve(import.meta.dirname, "../../../../node_modules/.bin/tsc");

/** Compiles `source` with tsc --strict; returns null on success or the compiler output. */
function compile(source: string): string | null {
  const dir = mkdtempSync(join(tmpdir(), "json-convert-ts-"));
  const file = join(dir, "check.ts");
  writeFileSync(file, source);
  try {
    // Run inside the temp folder so tsc does not pick up the package's tsconfig.json.
    execFileSync(TSC, ["--noEmit", "--strict", "--target", "es2022", "--skipLibCheck", file], { encoding: "utf8", cwd: dir });
    return null;
  } catch (e) {
    return String((e as { stdout?: string }).stdout ?? e);
  }
}

const CASES = [
  '{"users":[{"id":1,"name":"Ann","email":"a@x"},{"id":2,"name":"Bob","email":null},{"id":3,"name":"Cy"}],"total":12345678901234567890}',
  '[{"a":[1,"x",null]},{"a":[]}]',
  '{"weird key":{"nested-1":[[true]]},"empty":{},"list":[]}',
  '"just a string"',
  '[{"address":{"city":"Oslo"}},{"address":{"city":"Riga","zip":"1050"}}]',
];

describe("toTypeScript", () => {
  it("writes readable interfaces", () => {
    expect(toTypeScript('{"users":[{"id":1,"email":null},{"id":2,"email":"b"},{"id":3}],"tags":[],"meta":{"ok":true}}')).toEqual({
      ok: true,
      value: [
        "export interface Root {",
        "  users: User[];",
        "  tags: unknown[];",
        "  meta: Meta;",
        "}",
        "",
        "export interface User {",
        "  id: number;",
        "  email?: string | null;",
        "}",
        "",
        "export interface Meta {",
        "  ok: boolean;",
        "}",
        "",
      ].join("\n"),
    });
  });

  it("produces types that accept the data they came from", () => {
    const source = CASES.map((input, index) => {
      const result = toTypeScript(input, { rootName: `Case${index}` });
      if (!result.ok) throw new Error(result.error.message);
      return `namespace N${index} {\n${result.value}\nexport const data: Case${index} = ${input};\n}`;
    }).join("\n\n");
    expect(compile(source)).toBeNull();
  });

  it("produces types strict enough to reject a missing required field", () => {
    const result = toTypeScript('{"id":1,"name":"Ann"}');
    if (!result.ok) throw new Error(result.error.message);
    expect(compile(`${result.value}\nconst data: Root = { "id": 1 };\n`)).toContain("name");
  });

  it("always gives the root the requested name", () => {
    expect(toTypeScript('{"root":{"a":1}}')).toEqual({
      ok: true,
      value: "export interface Root {\n  root: Root2;\n}\n\nexport interface Root2 {\n  a: number;\n}\n",
    });
  });

  it("rejects reserved words and built-in type names", () => {
    for (const name of ["string", "class", "unknown"]) {
      expect(toTypeScript("1", { rootName: name })).toEqual({
        ok: false,
        error: { message: `"${name}" is not a valid TypeScript type name` },
      });
    }
  });

  it("rejects a type name that is not an identifier", () => {
    expect(toTypeScript("1", { rootName: "my type" })).toEqual({
      ok: false,
      error: { message: '"my type" is not a valid TypeScript type name' },
    });
  });
});
