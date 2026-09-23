import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { gutterWidth, HIGHLIGHT_LIMIT, HighlightedJson } from "./HighlightedJson";

afterEach(cleanup);

describe("HighlightedJson", () => {
  it("colors tokens and keeps the exact text", () => {
    const text = '{\n  "a": [1, true, null],\n  "b": "x"\n}';
    const { container } = render(<HighlightedJson text={text} aria-label="Output" />);
    const pre = container.querySelector("pre")!;
    expect(pre.textContent).toBe(text);
    expect(pre.querySelectorAll(".wk-code__line")).toHaveLength(4);
    expect([...pre.querySelectorAll(".wk-syntax-key")].map((node) => node.textContent)).toEqual(['"a"', '"b"']);
    expect(pre.querySelector(".wk-syntax-number")!.textContent).toBe("1");
    expect(pre.querySelectorAll(".wk-syntax-literal")).toHaveLength(2);
    expect(pre.querySelector(".wk-syntax-string")!.textContent).toBe('"x"');
  });

  it("sizes the line-number gutter to the number of lines", () => {
    expect([gutterWidth(1), gutterWidth(999), gutterWidth(1000), gutterWidth(123456)]).toEqual(["3ch", "3ch", "4ch", "6ch"]);
    const { container } = render(<HighlightedJson text={"[\n  1\n]"} />);
    expect(container.querySelector("pre")!.style.getPropertyValue("--wk-gutter")).toBe("3ch");
  });

  it("falls back to plain text above the limit", () => {
    const text = JSON.stringify("x".repeat(HIGHLIGHT_LIMIT));
    const { container } = render(<HighlightedJson text={text} />);
    expect(container.querySelector("pre")!.textContent).toBe(text);
    expect(container.querySelector("[class^='wk-syntax']")).toBeNull();
  });
});
