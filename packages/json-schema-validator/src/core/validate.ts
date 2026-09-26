import { parseJson, stripBom } from "@web-kit/json-core";
import { compileSchema } from "./compile";
import { evaluate, RefLoop, type Run } from "./evaluate";
import { locator } from "./text";
import type { ParseProblem, SchemaResult, SchemaWarning } from "./types";

/** Checks JSON data against a draft 2020-12 JSON Schema. Numbers are compared exactly, never through Number(). */
export function validateSchema(data: string, schema: string): SchemaResult {
  const parsedData = parseJson(data);
  const parsedSchema = parseJson(schema);
  const parseErrors: ParseProblem[] = [];
  if (!parsedData.ok) parseErrors.push({ input: "data", error: parsedData.error });
  if (!parsedSchema.ok) parseErrors.push({ input: "schema", error: parsedSchema.error });
  if (!parsedData.ok || !parsedSchema.ok) return { ok: false, stage: "parse", parseErrors };

  const schemaText = stripBom(schema);
  const inSchema = locator(schemaText);
  const compiled = compileSchema(parsedSchema.value, schemaText);
  const byOffset = (a: { start: number }, b: { start: number }) => a.start - b.start;
  const warnings: SchemaWarning[] = compiled.warnings.sort(byOffset).map((note) => ({
    keyword: note.keyword,
    schemaPath: note.schemaPath,
    message: note.message,
    schema: inSchema(note.start, note.end),
  }));
  const problems = compiled.problems.sort(byOffset).map((note) => ({
    schemaPath: note.schemaPath,
    message: note.message,
    schema: inSchema(note.start, note.end),
  }));
  if (problems.length > 0) return { ok: false, stage: "schema", problems, warnings };

  const run: Run = { failures: [], active: new Set() };
  let status;
  try {
    status = evaluate(compiled.root, parsedData.value, [], run);
  } catch (error) {
    if (!(error instanceof RefLoop)) throw error;
    const problem = {
      schemaPath: error.schemaPath,
      message: "$ref leads back to itself without checking any data",
      schema: inSchema(error.start, error.end),
    };
    return { ok: false, stage: "schema", problems: [problem], warnings };
  }
  const inData = locator(stripBom(data));
  const errors = run.failures
    .sort((a, b) => a.dataStart - b.dataStart)
    .map((failure) => ({
      message: failure.message,
      keyword: failure.keyword,
      dataPath: failure.dataPath,
      schemaPath: failure.schemaPath,
      data: inData(failure.dataStart, failure.dataEnd),
      schema: inSchema(failure.schemaStart, failure.schemaEnd),
    }));
  return { ok: true, valid: status !== "fail", errors, warnings };
}

const count = (n: number, word: string): string => `${n} ${n === 1 ? word : `${word}s`}`;

/** One line for a result. A result with warnings is never called plainly "Valid". */
export function summarizeSchemaResult(result: SchemaResult): string {
  if (!result.ok) {
    if (result.stage === "parse") {
      return result.parseErrors.map((p) => `${p.input === "data" ? "Data" : "Schema"} is not valid JSON`).join(" · ");
    }
    return `The schema has ${count(result.problems.length, "error")}; the data was not checked`;
  }
  const unchecked = result.warnings.length;
  const note = unchecked === 1 ? "1 keyword was not checked" : `${unchecked} keywords were not checked`;
  if (result.valid) return unchecked === 0 ? "Valid" : `Valid, but ${note}`;
  const errors = `Not valid: ${count(result.errors.length, "error")}`;
  return unchecked === 0 ? errors : `${errors}; ${note}`;
}
