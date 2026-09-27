import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compareTexts } from "../core/compare";
import { splitLines } from "../core/lines";
import type { Granularity } from "../core/types";
import { CHUNK_ROWS, DiffView, type DiffViewProps } from "./DiffView";
import { buildRows } from "./rows";
import { DEFAULT_OPTIONS, type IgnoreOptions, type Layout } from "./useTextCompare";

afterEach(cleanup);

interface Setup {
  layout?: Layout;
  granularity?: Granularity;
  options?: IgnoreOptions;
  limit?: number;
  current?: number | null;
  canMerge?: boolean;
}

function view(left: string, right: string, setup: Setup = {}) {
  const options = setup.options ?? DEFAULT_OPTIONS;
  const layout = setup.layout ?? "split";
  const comparison = { diff: compareTexts(left, right, options), left, right, options };
  const props: DiffViewProps = {
    comparison,
    lines: { left: splitLines(left), right: splitLines(right) },
    model: buildRows(comparison.diff, layout, new Set(), false),
    layout,
    granularity: setup.granularity ?? "word",
    limit: setup.limit ?? 5000,
    onShowMore: vi.fn(),
    onExpand: vi.fn(),
    current: setup.current ?? null,
    canMerge: setup.canMerge ?? true,
    onMerge: vi.fn(),
  };
  const { container } = render(<DiffView {...props} />);
  return { props, container };
}

/** Each row as its cells' text, "|" between cells. */
const cells = (container: HTMLElement) =>
  [...container.querySelectorAll(".wk-compare__row")].map((row) =>
    [...row.children].filter((cell) => !cell.classList.contains("wk-compare__actions")).map((cell) => cell.textContent).join("|"),
  );
const highlighted = (container: HTMLElement) => [...container.querySelectorAll(".wk-compare__hl")].map((mark) => mark.textContent);

describe("DiffView", () => {
  it("shows both texts side by side with line numbers, pairs on one row, a missing line as an empty cell", () => {
    const { container } = view("keep\nold word\ngone\n", "keep\nnew word\n");
    expect(cells(container)).toEqual(["1|keep|1|keep", "2|old word|2|new word", "3|gone||"]);
    const rows = container.querySelectorAll(".wk-compare__row");
    expect([...rows].map((row) => row.className.replace("wk-compare__row wk-compare__row--", ""))).toEqual(["equal", "changed", "removed"]);
    expect(rows[2]!.lastElementChild!.className).toBe("wk-compare__text wk-compare__text--none");
  });

  it("highlights the changed words of a pair, or its characters", () => {
    expect(highlighted(view("the quick fox\n", "the slow fox\n").container)).toEqual(["quick", "slow"]);
    cleanup();
    expect(highlighted(view("colour\n", "color\n", { granularity: "char" }).container)).toEqual(["u"]);
  });

  it("shows one column in the inline layout: old lines above new ones, with signs and both line numbers", () => {
    const { container } = view("keep\nold word\ngone\n", "keep\nnew word\n", { layout: "inline" });
    expect(cells(container)).toEqual(["1|1| |keep", "2||−|old word", "3||−|gone", "|2|+|new word"]);
    expect(highlighted(container)).toEqual(["old", "new"]);
  });

  it("folds a long unchanged run and asks to show it", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
    const { container, props } = view(`${lines.join("\n")}\n`, `${[...lines.slice(0, 19), "line 20!"].join("\n")}\n`);
    const fold = within(container).getByRole("button", { name: "Show 16 unchanged lines" });
    fireEvent.click(fold);
    expect(props.onExpand).toHaveBeenCalledWith(0);
    expect(cells(container)).toEqual(["17|line 17|17|line 17", "18|line 18|18|line 18", "19|line 19|19|line 19", "20|line 20|20|line 20!"]);
  });

  it("groups each change with its merge buttons on its first row, and says which change it is", () => {
    const { container, props } = view("a\nb1\nc\nd\ne1\ne2\n", "a\nb2\nc\nd\ne3\n", { current: 1 });
    const groups = screen.getAllByRole("group");
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual(["Change 1 of 2", "Change 2 of 2"]);
    expect(groups.map((group) => group.hasAttribute("data-current"))).toEqual([false, true]);
    expect(within(groups[1]!).getAllByRole("button").map((button) => button.textContent)).toEqual(["Use left", "Use right"]);
    expect(container.querySelectorAll(".wk-compare__merge")).toHaveLength(4);
    fireEvent.click(within(groups[1]!).getByRole("button", { name: "Use left" }));
    fireEvent.click(within(groups[0]!).getByRole("button", { name: "Use right" }));
    expect((props.onMerge as ReturnType<typeof vi.fn>).mock.calls).toEqual([
      [3, "to-right"],
      [1, "to-left"],
    ]);
  });

  it("disables the merge buttons while the result describes older text", () => {
    view("a\n", "b\n", { canMerge: false });
    for (const button of screen.getAllByRole("button")) expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("draws at most `limit` rows and offers the rest", () => {
    const left = Array.from({ length: 12 }, (_, i) => `left line ${i}`).join("\n");
    const right = Array.from({ length: 12 }, (_, i) => `right line ${i}`).join("\n");
    const { container, props } = view(left, right, { limit: 5 });
    expect(container.querySelectorAll(".wk-compare__row")).toHaveLength(5);
    expect(container.querySelector(".wk-compare__more")!.textContent).toBe("Showing 5 of 12 rows.Show more");
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(props.onShowMore).toHaveBeenCalledTimes(1);
  });

  it("marks a last line without a line break when the other side has one", () => {
    const { container } = view("a\nb", "a\nc\n", { options: { ...DEFAULT_OPTIONS, ignoreLineEndings: false } });
    const eof = container.querySelectorAll(".wk-compare__eof");
    expect([...eof].map((mark) => mark.closest(".wk-compare__text")!.firstChild!.textContent)).toEqual(["b"]);
  });

  it("sizes the line number columns for the longest side", () => {
    const { container } = view("a\n".repeat(1200), `${"a\n".repeat(1200)}b\n`);
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue("--wk-compare-digits")).toBe("4");
  });
});

describe("DiffView on a long result", () => {
  /** jsdom has no IntersectionObserver: this one reports only what a test says is near the view. */
  class Observer {
    static all: Observer[] = [];
    readonly seen = new Set<Element>();
    constructor(private readonly callback: IntersectionObserverCallback) {
      Observer.all.push(this);
    }
    observe(element: Element): void {
      this.seen.add(element);
    }
    unobserve(element: Element): void {
      this.seen.delete(element);
    }
    disconnect(): void {
      this.seen.clear();
    }
    report(element: Element, near: boolean): void {
      const entry = { target: element, isIntersecting: near, boundingClientRect: { height: 500 } };
      this.callback([entry as unknown as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
  }
  beforeEach(() => vi.stubGlobal("IntersectionObserver", Observer));
  afterEach(() => {
    vi.unstubAllGlobals();
    Observer.all = [];
  });

  // Every other line changed: a change block of one row between single unchanged lines.
  const LINES = 2000;
  const left = Array.from({ length: LINES }, (_, i) => (i % 2 ? `line ${i} with old words` : `same ${i}`)).join("\n");
  const right = Array.from({ length: LINES }, (_, i) => (i % 2 ? `line ${i} with new words` : `same ${i}`)).join("\n");
  const chunks = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>(".wk-compare__chunk")];

  it("draws only the rows of the chunks near the view; the others keep their place with their height", () => {
    const { container } = view(left, right);
    const all = chunks(container);
    expect(all).toHaveLength(LINES / CHUNK_ROWS);
    expect(container.querySelectorAll(".wk-compare__row").length).toBe(CHUNK_ROWS);
    const waiting = all.filter((chunk) => chunk.dataset.drawn === undefined);
    expect(waiting).toHaveLength(all.length - 1);
    expect(waiting.every((chunk) => Number.parseFloat(chunk.style.height) > 0)).toBe(true);
  });

  it("computes the highlight only for the rows it draws", () => {
    const { container } = view(left, right);
    expect(highlighted(container)).toHaveLength(CHUNK_ROWS);
  });

  it("draws a chunk when it comes near the view, and puts it back to its height when it leaves", () => {
    const { container } = view(left, right);
    const observer = Observer.all[0]!;
    const fifth = chunks(container)[5]!;
    expect(observer.seen.has(fifth)).toBe(true);
    act(() => observer.report(fifth, true));
    expect(chunks(container)[5]!.dataset.drawn).toBe("");
    expect(container.querySelectorAll(".wk-compare__row").length).toBe(2 * CHUNK_ROWS);
    act(() => observer.report(chunks(container)[5]!, false));
    expect(chunks(container)[5]!.dataset.drawn).toBeUndefined();
    expect(chunks(container)[5]!.style.height).toBe("500px");
  });

  it("always draws the chunk of the current change", () => {
    const { container } = view(left, right, { current: 700 });
    expect(container.querySelector('[data-current="true"]')).not.toBeNull();
    expect(screen.getByRole("group", { name: "Change 701 of 1000" })).toBeTruthy();
  });

  it("draws everything where there is no IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { container } = view(left, right);
    expect(container.querySelectorAll(".wk-compare__row").length).toBe(LINES);
  });
});
