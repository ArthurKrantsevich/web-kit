import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonSchemaValidator } from "./JsonSchemaValidator";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const area = (name: "Data" | "Schema") => screen.getByLabelText(name) as HTMLTextAreaElement;
const rows = (list: "Errors" | "Warnings" | "Schema errors") =>
  within(screen.getByRole("list", { name: list })).getAllByRole("button");
const status = () => document.querySelector(".wk-ui-status")!.textContent;

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
    const line = document.querySelector<HTMLElement>(".wk-ui-status")!;
    expect(line.getAttribute("role")).toBeNull();
    expect(within(line).queryByRole("status")).toBeNull();
  });

  it("announces the result in one live region that is there from the start", () => {
    render(<JsonSchemaValidator />);
    const live = screen.getByRole("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toBe("");
    fireEvent.change(area("Data"), { target: { value: "{" } });
    fireEvent.change(area("Schema"), { target: { value: "{}" } });
    expect(screen.getByRole("status")).toBe(live);
    expect(live.textContent).toBe("Data: Line 1, column 2: Unexpected end of input");
    fireEvent.change(area("Data"), { target: { value: "{}" } });
    expect(live.textContent).toBe("Valid");
  });

  it("keeps a keyword name with a backtick whole inside the code", () => {
    render(<JsonSchemaValidator initialData="1" initialSchema={'{"a`b":1}'} />);
    const message = rows("Warnings")[0]!.querySelector(".wk-schema__message")!;
    expect(message.innerHTML).toBe("keyword <code>a`b</code> is not checked");
  });

  it("leaves other messages with backticks as plain text", () => {
    render(<JsonSchemaValidator initialData="1" initialSchema={'{"$ref":"#/$defs/`x`"}'} />);
    const message = rows("Schema errors")[0]!.querySelector(".wk-schema__message")!;
    expect(message.innerHTML).toBe("$ref points to nothing: #/$defs/`x`");
  });

  it("shows backtick-quoted words of a message as code", () => {
    render(<JsonSchemaValidator initialData='{"long":1}' initialSchema='{"propertyNames":{"maxLength":3}}' />);
    const message = rows("Warnings")[0]!.querySelector(".wk-schema__message")!;
    expect(message.innerHTML).toBe("keyword <code>propertyNames</code> is not checked");
  });

  it("never calls a result with warnings plainly valid, and a warning selects the keyword in Schema", () => {
    render(<JsonSchemaValidator initialData='{"long":1}' initialSchema='{"propertyNames":{"maxLength":3}}' />);
    expect(status()).toBe("Valid, but 1 keyword was not checked");
    expect(screen.getByText("No errors found, but the keywords below were not checked.")).toBeTruthy();
    expect(rows("Warnings").map((row) => row.textContent)).toEqual(["#/propertyNameskeyword propertyNames is not checked"]);
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
    expect(status()).toMatch(/^ValidSchema generated from the data\.Undo/);
    // Undo sits in the status line, so neither the toolbar nor the Schema header changes when it appears.
    const line = document.querySelector<HTMLElement>(".wk-ui-status")!;
    fireEvent.click(within(line).getByRole("button", { name: "Undo generate" }));
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

function openInto(name: string, file: File) {
  return act(async () => {
    fireEvent.change(screen.getByLabelText(name), { target: { files: [file] } });
  });
}

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true });
}

const tooltipOf = (element: HTMLElement) =>
  element
    .getAttribute("aria-describedby")
    ?.split(" ")
    .map((id) => document.getElementById(id)?.textContent)
    .join(" ");

describe("JsonSchemaValidator actions", () => {
  it("opens files into Data and Schema", async () => {
    render(<JsonSchemaValidator />);
    await openInto("Open file into Data", new File(['{"age":-1}'], "data.json"));
    await openInto("Open file into Schema", new File([SCHEMA], "schema.json"));
    expect([area("Data").value, area("Schema").value]).toEqual(['{"age":-1}', SCHEMA]);
    expect(status()).toBe("Not valid: 2 errors");
  });

  it("says when a file is too large", async () => {
    render(<JsonSchemaValidator />);
    const big = new File(["x"], "big.json");
    Object.defineProperty(big, "size", { value: 10 * 1024 * 1024 + 1 });
    await openInto("Open file into Schema", big);
    expect(status()).toBe("Nothing to check yet.File is larger than 10 MB");
  });

  it("puts Paste before Open file, so its late appearance moves no other button", () => {
    setClipboard({ readText: () => Promise.resolve(""), writeText: () => Promise.resolve() });
    render(<JsonSchemaValidator initialSchema="{}" />);
    const head = area("Schema").closest("section")!.firstElementChild as HTMLElement;
    expect(within(head).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Paste into Schema",
      "Open file into Schema",
      "Download",
      "CopyCopiedCopy failed",
    ]);
  });

  it("pastes into Schema", async () => {
    setClipboard({ readText: () => Promise.resolve('{"type":"number"}'), writeText: () => Promise.resolve() });
    render(<JsonSchemaValidator initialData="1" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Paste into Schema" }));
    });
    expect(area("Schema").value).toBe('{"type":"number"}');
    expect(status()).toBe("Valid");
  });

  it("copies and downloads the schema as schema.json", async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    setClipboard({ writeText });
    const names: string[] = [];
    Object.defineProperty(URL, "createObjectURL", { value: () => "blob:test", configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: () => {}, configurable: true });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    render(<JsonSchemaValidator initialData='{"a":1}' />);
    for (const name of ["Download", "Copy"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    fireEvent.click(screen.getByRole("button", { name: "Generate schema from data" }));
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(names).toEqual(["schema.json"]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    });
    expect(writeText).toHaveBeenCalledWith(area("Schema").value);
  });

  it("colors a result with unchecked keywords as a warning, not as valid", () => {
    render(<JsonSchemaValidator initialData='{"long":1}' initialSchema='{"propertyNames":{"maxLength":3}}' />);
    expect(document.querySelector(".wk-ui-status")!.className).toBe("wk-ui-status wk-ui-status--warning");
  });

  it("every action says what it does", () => {
    setClipboard({ readText: () => Promise.resolve(""), writeText: () => Promise.resolve() });
    render(<JsonSchemaValidator initialData='{"a":1}' initialSchema='{"type":"string"}' />);
    fireEvent.click(screen.getByRole("button", { name: "Generate schema from data" }));
    const expected: [string, string][] = [
      ["Generate schema from data", "Replace the schema with one inferred from the data"],
      ["Sample", "Replace data and schema with an example"],
      ["Clear", "Empty data and schema"],
      ["Open file into Data", "Open a .json or .txt file into Data (up to 10 MB), or drop it on Data"],
      ["Paste into Data", "Paste from the clipboard into Data"],
      ["Undo generate", "Bring back the schema you had before generating"],
      ["Open file into Schema", "Open a .json or .txt file into Schema (up to 10 MB), or drop it on Schema"],
      ["Paste into Schema", "Paste from the clipboard into Schema"],
      ["Download", "Save the schema as schema.json"],
      ["Copy", "Copy the schema to the clipboard"],
      ["More actions", "Load from a URL, share, save, keyboard shortcuts"],
    ];
    for (const [name, tip] of expected) expect([name, tooltipOf(screen.getByRole("button", { name }))]).toEqual([name, tip]);
  });
});

describe("JsonSchemaValidator before hydration", () => {
  it("renders its text fields read-only in the server HTML, so nothing typed before hydration is silently lost", () => {
    const html = renderToString(<JsonSchemaValidator />);
    const areas = html.match(/<textarea[^>]*>/g) ?? [];
    expect(areas.length).toBeGreaterThan(0);
    for (const area of areas) expect(area).toContain('readOnly=""');
    const { container } = render(<JsonSchemaValidator />);
    for (const area of container.querySelectorAll("textarea")) expect(area.readOnly).toBe(false);
  });
});
