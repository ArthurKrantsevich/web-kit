import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTLE_DELAY, useSettled } from "./settled";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useSettled", () => {
  it("gives a value only once it has stayed the same for the pause, so a live region speaks once per burst", () => {
    const { result, rerender } = renderHook(({ value }) => useSettled(value), { initialProps: { value: "" } });
    expect(result.current).toBe("");
    for (const value of ["Hashed 1 byte", "Hashed 2 bytes", "Hashed 3 bytes"]) {
      rerender({ value });
      act(() => vi.advanceTimersByTime(SETTLE_DELAY - 1));
    }
    expect(result.current).toBe("");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("Hashed 3 bytes");
  });

  it("takes its own pause, and a pause of 0 gives the value at once", () => {
    const { result, rerender } = renderHook(({ value, delay }) => useSettled(value, delay), { initialProps: { value: "a", delay: 200 } });
    rerender({ value: "b", delay: 200 });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe("b");
    rerender({ value: "c", delay: 0 });
    expect(result.current).toBe("c");
    // Back to a pause: the last value given at once is kept, not the one before it.
    rerender({ value: "c", delay: 200 });
    expect(result.current).toBe("c");
  });
});
