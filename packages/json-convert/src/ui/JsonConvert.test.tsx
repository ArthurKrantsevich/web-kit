import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonConvert } from "./JsonConvert";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const inputArea = () => screen.getByLabelText("Input") as HTMLTextAreaElement;
const output = () => screen.getByLabelText("Output").textContent;
const type = (value: string) => fireEvent.change(inputArea(), { target: { value } });
const status = () => document.querySelector(".wk-ui-status")!.textContent;

/** Picks an option of a Select by the Select's name and the option's label. */
function choose(select: string, option: string) {
  fireEvent.click(screen.getByRole("button", { name: select }));
  fireEvent.click(screen.getByRole("option", { name: option }));
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

describe("JsonConvert", () => {
  it("converts to YAML by default", () => {
    render(<JsonConvert />);
    type('{"a":[1]}');
    expect(output()).toBe("a:\n  - 1\n");
  });

  it("converts to CSV with a chosen delimiter", () => {
    render(<JsonConvert />);
    type('[{"a":1,"b":"x"}]');
    choose("Convert to", "CSV");
    expect(output()).toBe("a,b\r\n1,x\r\n");
    choose("Delimiter", "Semicolon");
    expect(output()).toBe("a;b\r\n1;x\r\n");
  });

  it("reads CSV and detects types on request", () => {
    render(<JsonConvert initialTarget="csv-to-json" />);
    type("n,t\n1,true\n");
    expect(output()).toBe('[\n  {\n    "n": "1",\n    "t": "true"\n  }\n]');
    fireEvent.click(screen.getByLabelText("Detect numbers and booleans"));
    expect(output()).toBe('[\n  {\n    "n": 1,\n    "t": true\n  }\n]');
  });

  it("says XML is one-way and uses the root element name", () => {
    render(<JsonConvert initialTarget="xml" />);
    type("[1]");
    fireEvent.change(screen.getByLabelText("Root element"), { target: { value: "list" } });
    expect(output()).toContain("<list>");
    expect(screen.getByText(/one-way/)).toBeTruthy();
  });

  it("names the TypeScript root type", () => {
    render(<JsonConvert initialTarget="typescript" />);
    type('{"a":1}');
    fireEvent.change(screen.getByLabelText("Type name"), { target: { value: "Config" } });
    expect(output()).toBe("export interface Config {\n  a: number;\n}\n");
  });

  it("shows errors with a position or a path", () => {
    render(<JsonConvert initialTarget="csv" />);
    type('{"a":}');
    expect(screen.getByRole("status").textContent).toBe("Line 1, column 6: Unexpected character '}'");
    type('{"a":1}');
    expect(screen.getByRole("status").textContent).toBe("CSV needs an array of objects (at $)");
    expect(output()).toBe("");
  });

  it("copies the output", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<JsonConvert />);
    type("[1]");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy" })));
    expect(writeText).toHaveBeenCalledWith("- 1\n");
  });
});

describe("JsonConvert editor", () => {
  it("switches direction with the segments and remembers the JSON format", () => {
    render(<JsonConvert initialInput='[{"a":1}]' />);
    const direction = screen.getByRole("group", { name: "Direction" });
    expect(within(direction).getAllByRole("button").map((button) => button.textContent)).toEqual(["JSON → format", "CSV → JSON"]);
    choose("Convert to", "TypeScript");
    fireEvent.click(within(direction).getByRole("button", { name: "CSV → JSON" }));
    expect(screen.queryByRole("button", { name: "Convert to" })).toBeNull();
    expect(screen.getByRole("button", { name: "Delimiter" })).toBeTruthy();
    fireEvent.click(within(direction).getByRole("button", { name: "JSON → format" }));
    expect(output()).toBe("export type Root = RootItem[];\n\nexport interface RootItem {\n  a: number;\n}\n");
  });

  it("describes each format in the list", () => {
    render(<JsonConvert />);
    fireEvent.click(screen.getByRole("button", { name: "Convert to" }));
    const yaml = screen.getByRole("option", { name: "YAML" });
    expect(yaml.getAttribute("aria-selected")).toBe("true");
    expect(document.getElementById(yaml.getAttribute("aria-describedby")!)?.textContent).toBe("YAML 1.2, block style");
    expect(screen.getAllByRole("option").map((option) => option.getAttribute("aria-labelledby") && option.textContent)).toEqual([
      "YAMLYAML 1.2, block style",
      "CSVAn array of objects as rows",
      "XMLKeys become element names",
      "TypeScriptInterfaces inferred from the data",
    ]);
  });

  it("says what the CSV reads back as, and nothing it did not do for YAML", () => {
    render(<JsonConvert initialInput='[{"a":1}]' />);
    expect(status()).toBe("Converted·YAML 1.2; numbers keep their spelling");
    choose("Convert to", "CSV");
    expect(status()).toBe("Converted·Reads back as 1 row × 1 column");
    type('[{"a":1,"b":"x"},{"a":2,"b":"y"}]');
    expect(status()).toBe("Converted·Reads back as 2 rows × 2 columns");
  });

  it("says when nested objects or arrays were flattened into CSV cells", () => {
    render(<JsonConvert initialTarget="csv" />);
    type('[{"a":1,"b":{"c":true}},{"a":2,"b":{"c":false}}]');
    expect(status()).toBe("Converted·Reads back as 2 rows × 2 columns · nested values are flattened");
    type('[{"a":[1,2]}]');
    expect(status()).toBe("Converted·Reads back as 1 row × 1 column · nested values are flattened");
    type('[{"a":{}}]');
    expect(status()).toBe("Converted·Reads back as 1 row × 1 column · nested values are flattened");
  });

  it("counts the rows of CSV → JSON without claiming a check", () => {
    render(<JsonConvert initialTarget="csv-to-json" />);
    type("a\n1\n");
    expect(status()).toBe("Converted·1 row");
    type("a,b\n1,2\n3,4\n");
    expect(status()).toBe("Converted·2 rows");
    type("a,b\n");
    expect(status()).toBe("Converted·0 rows");
  });

  it("shows the XML one-way note whenever XML is the target, before and after a conversion", () => {
    const note = "one-way: XML has no arrays or types, so it cannot be turned back into the same JSON";
    render(<JsonConvert initialTarget="xml" />);
    expect(status()).toBe(`Paste JSON, open a file or load a sample.·${note}`);
    type('{"a":}');
    expect(status()).toBe(`Line 1, column 6: Unexpected character '}'·${note}`);
    type('{"a":1}');
    expect(status()).toBe(`Converted·${note}`);
    choose("Convert to", "YAML");
    expect(screen.queryByText(/one-way/)).toBeNull();
  });

  it("converts an empty array to empty CSV and says why there are no rows", () => {
    render(<JsonConvert initialTarget="csv" initialInput="[]" />);
    expect(output()).toBe("");
    expect(status()).toBe("Converted·the array is empty, so there are no rows");
    expect((screen.getByRole("button", { name: "Download" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Swap direction turns the CSV output into CSV input, and back", () => {
    render(<JsonConvert initialTarget="csv" initialInput='[{"a":1,"b":{"c":true}}]' />);
    fireEvent.click(screen.getByRole("button", { name: "Swap direction" }));
    // A textarea reports line breaks as \n; the CSV itself keeps CRLF.
    expect(inputArea().value).toBe("a,b.c\n1,true\n");
    expect(screen.getByRole("button", { name: "CSV → JSON" }).getAttribute("aria-pressed")).toBe("true");
    expect(output()).toBe('[\n  {\n    "a": "1",\n    "b.c": "true"\n  }\n]');
    fireEvent.click(screen.getByRole("button", { name: "Swap direction" }));
    expect(screen.getByRole("button", { name: "Convert to" }).textContent).toBe("CSV");
    expect(output()).toBe("a,b.c\r\n1,true\r\n");
  });

  it("offers Swap direction only between JSON and CSV", () => {
    render(<JsonConvert initialInput='[{"a":1}]' />);
    expect((screen.getByRole("button", { name: "Swap direction" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("downloads with the extension of the format", () => {
    const names: string[] = [];
    Object.defineProperty(URL, "createObjectURL", { value: () => "blob:test", configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: () => {}, configurable: true });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    render(<JsonConvert initialInput='[{"a":1}]' />);
    const download = () => fireEvent.click(screen.getByRole("button", { name: "Download" }));
    for (const format of ["YAML", "CSV", "XML", "TypeScript"]) {
      choose("Convert to", format);
      download();
    }
    fireEvent.click(screen.getByRole("button", { name: "CSV → JSON" }));
    type("a\n1\n");
    download();
    expect(names).toEqual(["converted.yaml", "converted.csv", "converted.xml", "types.ts", "converted.json"]);
  });

  it("opens a file, loads a sample for each direction and clears", async () => {
    render(<JsonConvert />);
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Open file"), { target: { files: [new File(["\uFEFF[true]"], "a.json")] } });
    });
    expect(inputArea().value).toBe("[true]");
    fireEvent.click(screen.getByRole("button", { name: "Sample" }));
    expect(() => JSON.parse(inputArea().value)).not.toThrow();
    fireEvent.click(screen.getByRole("button", { name: "CSV → JSON" }));
    fireEvent.click(screen.getByRole("button", { name: "Sample" }));
    expect(inputArea().value.split("\n")[0]).toBe("id,name,active,score");
    expect(status()).toBe("Converted·2 rows");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(inputArea().value).toBe("");
    expect(status()).toBe("Paste CSV, open a file or load a sample.");
  });

  it("refuses files over 10 MB and pastes from the clipboard", async () => {
    setClipboard({ readText: () => Promise.resolve("[2]"), writeText: () => Promise.resolve() });
    render(<JsonConvert initialInput="[1]" />);
    const big = new File(["x"], "big.json");
    Object.defineProperty(big, "size", { value: 10 * 1024 * 1024 + 1 });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Open file"), { target: { files: [big] } });
    });
    expect(inputArea().value).toBe("[1]");
    expect(screen.getByText("File is larger than 10 MB")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Paste" }));
    });
    expect(inputArea().value).toBe("[2]");
    expect(screen.queryByText("File is larger than 10 MB")).toBeNull();
  });

  it("colors the output by format and keeps its text exact", () => {
    render(<JsonConvert initialInput='{"id":7,"name":"Ann"}' />);
    const spans = () =>
      [...screen.getByLabelText("Output").querySelectorAll("span")].map((span) => [span.className, span.textContent]);
    expect(spans()).toEqual([
      ["wk-syntax-key", "id"],
      ["wk-syntax-punctuation", ":"],
      ["wk-syntax-number", "7"],
      ["wk-syntax-key", "name"],
      ["wk-syntax-punctuation", ":"],
      ["wk-syntax-string", "Ann"],
    ]);
    choose("Convert to", "XML");
    expect(spans()).toContainEqual(["wk-syntax-key", "name"]);
    expect(output()).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <id>7</id>\n  <name>Ann</name>\n</root>\n');
  });

  it("shows a very large output as plain text", () => {
    const big = JSON.stringify(Array.from({ length: 20_000 }, (_, id) => ({ id, name: "user" })));
    render(<JsonConvert initialInput={big} initialTarget="csv" />);
    expect(screen.getByLabelText("Output").querySelector("span")).toBeNull();
    expect(output()!.startsWith("id,name\r\n0,user\r\n")).toBe(true);
  });

  it("every action says what it does", () => {
    setClipboard({ readText: () => Promise.resolve(""), writeText: () => Promise.resolve() });
    render(<JsonConvert initialInput="[1]" />);
    const expected: [string, string][] = [
      ["JSON → format", "Convert JSON to YAML, CSV, XML or TypeScript"],
      ["CSV → JSON", "Convert CSV with a header row to JSON"],
      ["Open file", "Open a .json, .csv or .txt file (up to 10 MB), or drop it on the input"],
      ["Sample", "Replace the input with an example"],
      ["Clear", "Empty the input"],
      ["Paste", "Paste from the clipboard"],
      ["Swap direction", "Make the output the input and convert the other way"],
      ["Download", "Save the output as converted.yaml"],
      ["Copy", "Copy the output to the clipboard"],
      ["More actions", "Load from a URL, share, save, keyboard shortcuts"],
    ];
    for (const [name, tip] of expected) expect([name, tooltipOf(screen.getByRole("button", { name }))]).toEqual([name, tip]);
  });
});

/** The shared actions of a row, in order. */
const actions = (row: Element | null) => [...(row?.querySelectorAll("[data-action]") ?? [])].map((button) => button.getAttribute("data-action"));

describe("JsonConvert actions and fields", () => {
  it("puts Open file and Paste in the input's header; Swap direction, Download and Copy in the output's; Sample, Clear and More in the toolbar", () => {
    setClipboard({ readText: () => Promise.resolve(""), writeText: () => Promise.resolve() });
    const { container } = render(<JsonConvert initialInput="[1]" />);
    expect(actions(container.querySelector('[data-pane="input"] > .wk-ui-pane__head'))).toEqual(["open", "paste"]);
    expect(actions(container.querySelector('[data-pane="output"] > .wk-ui-pane__head'))).toEqual(["custom", "download", "copy"]);
    expect(actions(screen.getByRole("group", { name: "Options" }))).toEqual(["sample", "clear", "more"]);
  });

  it("takes at most 64 characters in Root element and Type name", () => {
    render(<JsonConvert initialInput="[1]" initialTarget="xml" />);
    expect((screen.getByRole("textbox", { name: "Root element" }) as HTMLInputElement).maxLength).toBe(64);
    choose("Convert to", "TypeScript");
    expect((screen.getByRole("textbox", { name: "Type name" }) as HTMLInputElement).maxLength).toBe(64);
  });
});

describe("JsonConvert before hydration", () => {
  it("renders its text fields read-only in the server HTML, so nothing typed before hydration is silently lost", () => {
    const html = renderToString(<JsonConvert />);
    const areas = html.match(/<textarea[^>]*>/g) ?? [];
    expect(areas.length).toBeGreaterThan(0);
    for (const area of areas) expect(area).toContain('readOnly=""');
    const { container } = render(<JsonConvert />);
    for (const area of container.querySelectorAll("textarea")) expect(area.readOnly).toBe(false);
  });
});
