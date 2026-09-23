import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonConvert } from "./JsonConvert";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const output = () => screen.getByLabelText("Output").textContent;
const type = (value: string) => fireEvent.change(screen.getByLabelText("Input"), { target: { value } });
const target = (value: string) => fireEvent.change(screen.getByLabelText("Convert"), { target: { value } });

describe("JsonConvert", () => {
  it("converts to YAML by default", () => {
    render(<JsonConvert />);
    type('{"a":[1]}');
    expect(output()).toBe("a:\n  - 1\n");
  });

  it("converts to CSV with a chosen delimiter", () => {
    render(<JsonConvert />);
    type('[{"a":1,"b":"x"}]');
    target("csv");
    expect(output()).toBe("a,b\r\n1,x\r\n");
    fireEvent.change(screen.getByLabelText("Delimiter"), { target: { value: ";" } });
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
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<JsonConvert />);
    type("[1]");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy" })));
    expect(writeText).toHaveBeenCalledWith("- 1\n");
  });
});
