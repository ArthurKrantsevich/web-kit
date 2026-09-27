import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonDiff } from "./JsonDiff";

/** While `lag.on` is true, useDeferredValue keeps returning the value it had, as React does while a render lags. */
const lag = vi.hoisted(() => ({ on: false }));

vi.mock("react", async (importOriginal) => {
  const React = await importOriginal<typeof import("react")>();
  return {
    ...React,
    useDeferredValue<T>(value: T): T {
      const kept = React.useRef(value);
      if (!lag.on) kept.current = value;
      return kept.current;
    },
  };
});

afterEach(() => {
  cleanup();
  lag.on = false;
});

const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("JsonDiff while the result lags behind the text", () => {
  it("disables Copy JSON Patch and Download until the patch matches the text again", () => {
    render(<JsonDiff initialLeft='{"n":1}' initialRight='{"n":2}' />);
    expect(button("Copy JSON Patch").disabled).toBe(false);
    lag.on = true;
    fireEvent.change(screen.getByLabelText("Right"), { target: { value: '{"n":3}' } });
    expect(button("Copy JSON Patch").disabled).toBe(true);
    expect(button("Download").disabled).toBe(true);
    lag.on = false;
    fireEvent.change(screen.getByLabelText("Right"), { target: { value: '{"n":4}' } });
    expect(button("Copy JSON Patch").disabled).toBe(false);
    expect(button("Download").disabled).toBe(false);
  });
});
