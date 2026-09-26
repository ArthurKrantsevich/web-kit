import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { JsonSchemaValidator } from "./JsonSchemaValidator";

afterEach(cleanup);

const area = (name: "Data" | "Schema") => screen.getByLabelText(name) as HTMLTextAreaElement;
const rows = (list: "Errors" | "Warnings" | "Schema errors") =>
  within(screen.getByRole("list", { name: list })).getAllByRole("button");
const status = () => document.querySelector(".wk-schema__status")!.textContent;

const SCHEMA = '{"type":"object","properties":{"age":{"type":"integer","minimum":0}},"required":["name"]}';

describe("JsonSchemaValidator", () => {
  it("lists errors with the data path, message and schema path", () => {
    render(<JsonSchemaValidator initialData='{"age":-1.5}' initialSchema={SCHEMA} />);
    expect(rows("Errors").map((row) => row.textContent)).toEqual([
      '$Missing required property "name"#/required',
      "$.ageExpected integer, got number#/properties/age/type",
      "$.ageExpected at least 0, got -1.5#/properties/age/minimum",
    ]);
    expect(screen.getByText("3 errors")).toBeTruthy();
    expect(status()).toBe("Not valid: 3 errors");
  });

  it("selects the value in Data when an error is clicked, BOM included", () => {
    render(<JsonSchemaValidator initialData={'\uFEFF{"age": -1, "name": "x"}'} initialSchema={SCHEMA} />);
    fireEvent.click(rows("Errors")[0]!);
    expect([area("Data").selectionStart, area("Data").selectionEnd]).toEqual([9, 11]);
  });

  it("says the data matches and has no status role in the status line", () => {
    render(<JsonSchemaValidator initialData='{"name":"a","age":1.0}' initialSchema={SCHEMA} />);
    expect(screen.getByText("The data matches the schema.")).toBeTruthy();
    expect(status()).toBe("Valid");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("never calls a result with warnings plainly valid, and a warning selects the keyword in Schema", () => {
    render(<JsonSchemaValidator initialData='{"long":1}' initialSchema='{"propertyNames":{"maxLength":3}}' />);
    expect(status()).toBe("Valid, but 1 keyword was not checked");
    expect(screen.getByText("No errors found, but the keywords below were not checked.")).toBeTruthy();
    expect(rows("Warnings").map((row) => row.textContent)).toEqual(["#/propertyNameskeyword `propertyNames` is not checked"]);
    fireEvent.click(rows("Warnings")[0]!);
    expect([area("Schema").selectionStart, area("Schema").selectionEnd]).toEqual([1, 32]);
  });

  it("names the input of a parse error", () => {
    render(<JsonSchemaValidator initialData="{" initialSchema="{}" />);
    expect(screen.getByRole("status").textContent).toBe("Data: Line 1, column 2: Unexpected end of input");
    expect(status()).toBe("Data is not valid JSON");
  });

  it("lists schema errors and selects them in Schema", () => {
    render(<JsonSchemaValidator initialData="1" initialSchema='{"$ref":"https://example.com/s.json"}' />);
    expect(rows("Schema errors").map((row) => row.textContent)).toEqual(["#/$refremote $ref is not supported"]);
    expect(status()).toBe("The schema has 1 error; the data was not checked");
    fireEvent.click(rows("Schema errors")[0]!);
    expect([area("Schema").selectionStart, area("Schema").selectionEnd]).toEqual([1, 36]);
  });

  it("generates a schema from the data and can undo it", () => {
    render(<JsonSchemaValidator initialData='{"a":1}' initialSchema='{"type":"string"}' />);
    fireEvent.click(screen.getByRole("button", { name: "Generate schema from data" }));
    expect(area("Schema").value).toBe(
      '{\n  "$schema": "https://json-schema.org/draft/2020-12/schema",\n  "type": "object",\n  "properties": {\n    "a": {\n      "type": "number"\n    }\n  },\n  "required": [\n    "a"\n  ]\n}',
    );
    expect(status()).toBe("ValidSchema generated from the data.");
    fireEvent.click(screen.getByRole("button", { name: "Undo generate" }));
    expect(area("Schema").value).toBe('{"type":"string"}');
    expect(screen.queryByRole("button", { name: "Undo generate" })).toBeNull();
  });

  it("explains why a schema cannot be generated", () => {
    render(<JsonSchemaValidator initialData="{" />);
    fireEvent.click(screen.getByRole("button", { name: "Generate schema from data" }));
    expect(status()).toBe("Nothing to check yet.Could not generate a schema: Data line 1, column 2: Unexpected end of input");
    expect(area("Schema").value).toBe("");
  });

  it("loads a sample and clears", () => {
    render(<JsonSchemaValidator />);
    expect(screen.getByText("Paste JSON data and a schema, or load a sample.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Generate schema from data" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Sample" }));
    expect(rows("Errors").map((row) => row.querySelector("code")!.textContent)).toEqual(["$", "$.version", "$.homepage", "$.stars", "$.tags[2]"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect([area("Data").value, area("Schema").value]).toEqual(["", ""]);
  });

  // Renders 1,000 rows; slow under a full parallel `pnpm verify`, so it gets its own timeout.
  it("lists at most 1,000 errors and says how many more there are", { timeout: 20_000 }, () => {
    const data = `[${Array.from({ length: 1500 }, () => '"x"').join(",")}]`;
    render(<JsonSchemaValidator initialData={data} initialSchema='{"items":{"type":"number"}}' />);
    expect(rows("Errors")).toHaveLength(1000);
    expect(screen.getByText("500 more errors are not listed.")).toBeTruthy();
    expect(status()).toBe("Not valid: 1500 errors");
  });
});
