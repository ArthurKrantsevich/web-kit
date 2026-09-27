import { useLayoutEffect } from "react";
import { describe, expect, it } from "vitest";
import { useIsomorphicLayoutEffect } from "./popover";

describe("useIsomorphicLayoutEffect in the browser", () => {
  it("is useLayoutEffect, so a floating element is placed before paint", () => {
    expect(useIsomorphicLayoutEffect).toBe(useLayoutEffect);
  });
});
