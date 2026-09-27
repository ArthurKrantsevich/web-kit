// @vitest-environment node
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import { useIsomorphicLayoutEffect } from "./popover";

describe("useIsomorphicLayoutEffect on the server", () => {
  it("is useEffect, so React 18 does not warn about layout effects during a server render", () => {
    expect(useIsomorphicLayoutEffect).toBe(useEffect);
  });
});
