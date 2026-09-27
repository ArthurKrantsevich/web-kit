import { compressText } from "@web-kit/ui";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JsonSchemaValidator } from "./JsonSchemaValidator";

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", "/tools/json-schema-validator/");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const area = (name: "Data" | "Schema") => screen.getByLabelText(name) as HTMLTextAreaElement;
const status = () => document.querySelector(".wk-ui-status")!.textContent;

describe("JsonSchemaValidator shortcuts, files and links", () => {
  it("Ctrl+Enter generates the schema from the data, or says the data is missing", () => {
    render(<JsonSchemaValidator />);
    fireEvent.keyDown(area("Data"), { key: "Enter", ctrlKey: true });
    expect(status()).toContain("Paste the JSON data first; the schema is generated from it.");
    fireEvent.change(area("Data"), { target: { value: '{"a":1}' } });
    fireEvent.keyDown(area("Data"), { key: "Enter", ctrlKey: true });
    expect(JSON.parse(area("Schema").value)).toMatchObject({ type: "object", required: ["a"] });
  });

  it("opens a file dropped on Schema into Schema", async () => {
    render(<JsonSchemaValidator initialData="1" />);
    await act(async () => {
      fireEvent.drop(area("Schema").closest("section")!, {
        dataTransfer: { types: ["Files"], files: [new File(['{"type":"string"}'], "s.json")] },
      });
    });
    expect(area("Schema").value).toBe('{"type":"string"}');
    expect(status()).toBe("Not valid: 1 error");
  });

  it("loads Data from a URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"from":"url"}')));
    render(<JsonSchemaValidator />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Load Data from URL…" }));
    const dialog = screen.getByRole("dialog", { name: "Load Data from URL" });
    fireEvent.change(within(dialog).getByLabelText("URL"), { target: { value: "https://example.com/d.json" } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Load" }));
    });
    expect(area("Data").value).toBe('{"from":"url"}');
  });

  it("opens a share link with the data and the schema", async () => {
    const state = { data: '{"age":-1}', schema: '{"properties":{"age":{"minimum":0}}}' };
    history.replaceState(null, "", `/tools/json-schema-validator/#json-schema-validator=${await compressText(JSON.stringify({ v: 1, state }))}`);
    render(<JsonSchemaValidator />);
    await waitFor(() => expect(status()).toBe("Not valid: 1 error"));
    expect(area("Data").value).toBe('{"age":-1}');
  });

  it("Show in Data says what it does", () => {
    render(<JsonSchemaValidator initialData="{" initialSchema="{}" />);
    const show = screen.getByRole("button", { name: "Show in Data" });
    expect(document.getElementById(show.getAttribute("aria-describedby")!)?.textContent).toBe("Select the error in Data");
  });
});

describe("JsonSchemaValidator and a file dropped beside the panes", () => {
  it("keeps the page and the input, and says where to drop it", async () => {
    render(<JsonSchemaValidator />);
    const before = (screen.getByLabelText("Data") as HTMLTextAreaElement).value;
    const toolbar = document.querySelector(".wk-ui-editor__toolbar")!;
    const dataTransfer = { types: ["Files"], files: [new File(['{"dropped":true}'], "d.json")] };
    expect(fireEvent.dragOver(toolbar, { dataTransfer })).toBe(false);
    await act(async () => {
      expect(fireEvent.drop(toolbar, { dataTransfer })).toBe(false);
    });
    expect((screen.getByLabelText("Data") as HTMLTextAreaElement).value).toBe(before);
    expect(document.querySelector(".wk-ui-status")!.textContent).toContain("Drop the file on Data or Schema to open it");
  });
});
