import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonFormatter } from "./JsonFormatter";

const measured = vi.hoisted(() => [] as string[]);

vi.mock("@web-kit/json-core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@web-kit/json-core")>();
  return {
    ...core,
    utf8Length: (text: string) => {
      measured.push(text);
      return core.utf8Length(text);
    },
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  measured.length = 0;
});

const type = (value: string) => fireEvent.change(screen.getByLabelText("Input"), { target: { value } });

describe("JsonFormatter sizes", () => {
  it("measures the input with json-core's utf8Length, without encoding it", () => {
    const encode = vi.spyOn(TextEncoder.prototype, "encode");
    const { container } = render(<JsonFormatter />);
    type('{"a":"é"}');
    expect(container.querySelector(".wk-json__size")?.textContent).toBe("10 B");
    expect(measured).toContain('{"a":"é"}');
    expect(encode).not.toHaveBeenCalled();
  });

  it("measures the output only when its size is shown", () => {
    render(<JsonFormatter />);
    type('{"a":1}');
    expect(measured).not.toContain('{\n  "a": 1\n}');
    fireEvent.click(screen.getByRole("button", { name: "Escape" }));
    expect(measured).toContain('"{\\"a\\":1}"');
  });
});
