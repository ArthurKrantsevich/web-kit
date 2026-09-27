import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { TextCompare } from "./Component";

afterEach(cleanup);

it("shows the result for input", () => {
  render(<TextCompare />);
  fireEvent.change(screen.getByLabelText("Input"), { target: { value: " a " } });
  expect((screen.getByLabelText("Output") as HTMLTextAreaElement).value).toBe("a");
});
