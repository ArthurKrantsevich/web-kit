import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as highlight from "./highlight";
import { HighlightedOutput } from "./HighlightedOutput";

vi.mock("./highlight", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./highlight")>();
  return { ...actual, tokenizeOutput: vi.fn(actual.tokenizeOutput) };
});

afterEach(cleanup);

describe("HighlightedOutput", () => {
  it("tokenizes again only when the text, the format or the delimiter changes, not on every render", () => {
    const tokenize = vi.mocked(highlight.tokenizeOutput);
    tokenize.mockClear();
    const view = render(<HighlightedOutput text={"a: 1\n"} target="yaml" delimiter="," />);
    view.rerender(<HighlightedOutput text={"a: 1\n"} target="yaml" delimiter="," />);
    view.rerender(<HighlightedOutput text={"a: 1\n"} target="yaml" delimiter="," />);
    expect(tokenize).toHaveBeenCalledTimes(1);
    view.rerender(<HighlightedOutput text={"a: 2\n"} target="yaml" delimiter="," />);
    expect(tokenize).toHaveBeenCalledTimes(2);
  });
});
