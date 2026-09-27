import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { useHydrated } from "./hydrated";

afterEach(cleanup);

function Probe() {
  return <output aria-label="hydrated">{String(useHydrated())}</output>;
}

describe("useHydrated", () => {
  it("is false in the server HTML and true once React runs in the browser", () => {
    expect(renderToString(<Probe />)).toContain(">false<");
    render(<Probe />);
    expect(screen.getByLabelText("hydrated").textContent).toBe("true");
  });
});
