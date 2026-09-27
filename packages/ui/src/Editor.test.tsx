import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EditorPane, EditorPanes, EditorShell, EditorToolbar, StatusLine } from "./Editor";

afterEach(cleanup);

describe("editor layout", () => {
  it("builds the card from a toolbar, labelled panes and a status line", () => {
    const { container } = render(
      <EditorShell
        className="wk-json"
        toolbar={<EditorToolbar>tools</EditorToolbar>}
        status={
          <StatusLine state="valid">
            <span>Valid JSON</span>
          </StatusLine>
        }
      >
        <EditorPanes>
          <EditorPane title="Input" labelFor="in" meta="4 B" actions={<button type="button">Paste</button>}>
            <textarea id="in" />
          </EditorPane>
          <EditorPane title="Output">
            <pre aria-label="Output" />
          </EditorPane>
        </EditorPanes>
      </EditorShell>,
    );
    const root = container.firstElementChild!;
    expect(root.className).toBe("wk-ui-editor wk-json");
    expect(screen.getByRole("group", { name: "Options" }).textContent).toBe("tools");
    expect(screen.getByLabelText("Input").tagName).toBe("TEXTAREA");
    expect(container.querySelector(".wk-ui-pane__meta")?.textContent).toBe("4 B");
    expect(container.querySelector(".wk-ui-status")?.className).toBe("wk-ui-status wk-ui-status--valid");
    expect(screen.queryByRole("status")).toBeNull();
  });
});
