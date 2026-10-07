import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CodeScanner } from "./Component";

afterEach(cleanup);

it("shows the result for input", () => {
  render(<CodeScanner />);
  fireEvent.change(screen.getByLabelText("Input"), { target: { value: " a " } });
  expect((screen.getByLabelText("Output") as HTMLTextAreaElement).value).toBe("a");
});
