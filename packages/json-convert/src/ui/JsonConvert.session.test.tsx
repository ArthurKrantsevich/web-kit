import { compressText } from "@web-kit/ui";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JsonConvert } from "./JsonConvert";

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/tools/json-convert/");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const inputArea = () => screen.getByLabelText("Input") as HTMLTextAreaElement;
const output = () => screen.getByLabelText("Output").textContent;
const status = () => document.querySelector(".wk-ui-status")!.textContent;

describe("JsonConvert shortcuts, files and links", () => {
  it("Ctrl+Enter swaps JSON → CSV and CSV → JSON, and says when it cannot", () => {
    render(<JsonConvert initialInput='[{"a":1}]' initialTarget="csv" />);
    fireEvent.keyDown(inputArea(), { key: "Enter", ctrlKey: true });
    expect(screen.getByRole("button", { name: "CSV → JSON" }).getAttribute("aria-pressed")).toBe("true");
    expect(inputArea().value).toBe("a\n1\n");
    fireEvent.click(screen.getByRole("button", { name: "JSON → …" }));
    fireEvent.click(screen.getByRole("button", { name: "Convert to" }));
    fireEvent.click(screen.getByRole("option", { name: "YAML" }));
    fireEvent.keyDown(inputArea(), { key: "Enter", ctrlKey: true });
    expect(status()).toContain("Swap direction works between JSON → CSV and CSV → JSON, once there is output");
  });

  it("opens a CSV file dropped on the input pane, and refuses an image", async () => {
    render(<JsonConvert initialTarget="csv-to-json" />);
    const pane = inputArea().closest("section")!;
    await act(async () => {
      fireEvent.drop(pane, { dataTransfer: { types: ["Files"], files: [new File(["x\n1\n"], "t.csv", { type: "text/csv" })] } });
    });
    expect(inputArea().value).toBe("x\n1\n");
    await act(async () => {
      fireEvent.drop(pane, { dataTransfer: { types: ["Files"], files: [new File(["x"], "p.png", { type: "image/png" })] } });
    });
    expect(status()).toContain('Cannot open "p.png": choose a .json, .csv or .txt file');
  });

  it("opens a share link with the same input, direction and options", async () => {
    const state = { input: "a;b\n1;2\n", target: "csv-to-json", delimiter: ";", inferTypes: true, xmlRoot: "root", typeName: "Root" };
    history.replaceState(null, "", `/tools/json-convert/#json-convert=${await compressText(JSON.stringify({ v: 1, state }))}`);
    render(<JsonConvert />);
    await waitFor(() => expect(output()).toBe('[\n  {\n    "a": 1,\n    "b": 2\n  }\n]'));
    expect(screen.getByRole("button", { name: "CSV → JSON" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("restores a JSON target so that switching directions comes back to it", async () => {
    const state = { input: '{"a":1}', target: "typescript", delimiter: "|", xmlRoot: 5 };
    history.replaceState(null, "", `/tools/json-convert/#json-convert=${await compressText(JSON.stringify({ v: 1, state }))}`);
    render(<JsonConvert />);
    await waitFor(() => expect(output()).toBe("export interface Root {\n  a: number;\n}\n"));
    fireEvent.click(screen.getByRole("button", { name: "CSV → JSON" }));
    fireEvent.click(screen.getByRole("button", { name: "JSON → …" }));
    expect(screen.getByRole("button", { name: "Convert to" }).textContent).toBe("TypeScript");
  });
});
