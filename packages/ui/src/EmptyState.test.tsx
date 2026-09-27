import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";

afterEach(cleanup);

describe("EmptyState", () => {
  it("shows an icon in a circle, the title, a line of text and one action", () => {
    const onClick = vi.fn();
    const { container } = render(
      <EmptyState
        icon="search"
        title="Nothing matches “zzz”"
        action={
          <Button variant="outline" onClick={onClick}>
            Clear search
          </Button>
        }
      >
        Try a shorter word, or browse every tool.
      </EmptyState>,
    );
    const root = container.firstElementChild!;
    expect(root.className).toBe("wk-ui-empty wk-ui-empty--md");
    expect(root.querySelector(".wk-ui-empty__icon svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(root.querySelector(".wk-ui-empty__title")?.textContent).toBe("Nothing matches “zzz”");
    expect(root.querySelector(".wk-ui-empty__text")?.textContent).toBe("Try a shorter word, or browse every tool.");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("has a compact size for tool panes and leaves out what it is not given", () => {
    const { container } = render(<EmptyState size="sm" title="No differences." className="wk-diff__same" />);
    const root = container.firstElementChild!;
    expect(root.className).toBe("wk-ui-empty wk-ui-empty--sm wk-diff__same");
    expect(root.children).toHaveLength(1);
    expect(screen.getByText("No differences.").tagName).toBe("P");
  });
});
