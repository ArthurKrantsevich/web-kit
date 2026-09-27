import { describe, expect, it } from "vitest";
import { applyBlock } from "./apply";
import { compareTexts } from "./compare";
import { editText, pick, random, randomText } from "./seeded";
import type { CompareOptions, TextDiff } from "./types";

const changeIndexes = (diff: TextDiff) => diff.blocks.flatMap((block, index) => (block.kind === "change" ? [index] : []));

function use(left: string, right: string, direction: "to-left" | "to-right", nth = 0, options: CompareOptions = {}): string {
  const diff = compareTexts(left, right, options);
  return applyBlock(left, right, diff, changeIndexes(diff)[nth]!, direction, options);
}

describe("applyBlock", () => {
  it("replaces the block's lines on the target side and keeps the rest", () => {
    expect(use("a\nold\nc\nx\n", "a\nnew\nc\ny\n", "to-left")).toBe("a\nnew\nc\nx\n");
    expect(use("a\nold\nc\nx\n", "a\nnew\nc\ny\n", "to-right")).toBe("a\nold\nc\ny\n");
    expect(use("a\nold\nc\nx\n", "a\nnew\nc\ny\n", "to-right", 1)).toBe("a\nnew\nc\nx\n");
  });

  it("inserts and deletes whole lines", () => {
    expect(use("a\nc\n", "a\nb\nc\n", "to-left")).toBe("a\nb\nc\n");
    expect(use("a\nc\n", "a\nb\nc\n", "to-right")).toBe("a\nc\n");
  });

  it("gives copied lines the line ending most lines of the target have", () => {
    expect(use("a\r\nold\r\nc\r\n", "a\nnew\nmore\nc\n", "to-left")).toBe("a\r\nnew\r\nmore\r\nc\r\n");
  });

  it("copies line endings as written when they are compared", () => {
    expect(use("a\r\nold\r\nc\r\n", "a\r\nnew\n\r\nc\r\n", "to-left", 0, { ignoreLineEndings: false })).toBe("a\r\nnew\n\r\nc\r\n");
  });

  it("ends like the source when the block reaches the end", () => {
    expect(use("a\nb\n", "a\nc", "to-left")).toBe("a\nc");
    expect(use("a\nb", "a\nc\n", "to-left")).toBe("a\nc\n");
  });

  it("gives a last line without a line break one when lines are added after it", () => {
    expect(use("a", "a\nb\n", "to-left")).toBe("a\nb\n");
  });

  it("keeps a copied empty line apart from a line before it that ends with a lone CR", () => {
    // "x\r" + "" + "\n" would read back as the one line "x" with a CRLF ending.
    expect(use("x\r\r\ny\n", "x\ry\n", "to-right")).toBe("x\r\ry\n");
  });

  it("keeps the target's BOM", () => {
    expect(use("\uFEFFa\nb\n", "a\nc\n", "to-left")).toBe("\uFEFFa\nc\n");
  });

  it("leaves the text as it is for an equal block or a missing one", () => {
    const diff = compareTexts("a\nb\n", "a\nc\n");
    expect(applyBlock("a\nb\n", "a\nc\n", diff, 0, "to-left")).toBe("a\nb\n");
    expect(applyBlock("a\nb\n", "a\nc\n", diff, 9, "to-right")).toBe("a\nc\n");
  });

  describe("on random texts (seeded)", () => {
    const OPTION_SETS: CompareOptions[] = [{}, { ignoreLineEndings: false }, { ignoreWhitespace: true }, { ignoreCase: true }, { ignoreBlankLines: true }];
    const changes = (left: string, right: string, options: CompareOptions) => changeIndexes(compareTexts(left, right, options)).length;

    for (const direction of ["to-left", "to-right"] as const) {
      it(`moving every block ${direction} makes the texts equal`, () => {
        for (let seed = 1; seed <= 400; seed++) {
          const next = random(seed);
          const left = randomText(next, 30);
          const right = next() < 0.75 ? editText(next, left) : randomText(next, 30);
          const options = pick(next, OPTION_SETS);
          const diff = compareTexts(left, right, options);
          // From the last block to the first: a replaced block does not shift the lines of the blocks before it.
          let target = direction === "to-left" ? left : right;
          for (const index of changeIndexes(diff).reverse()) {
            target = direction === "to-left"
              ? applyBlock(target, right, diff, index, direction, options)
              : applyBlock(left, target, diff, index, direction, options);
          }
          const [newLeft, newRight] = direction === "to-left" ? [target, right] : [left, target];
          expect([seed, changes(newLeft, newRight, options)]).toEqual([seed, 0]);
          if (options.ignoreLineEndings === false) expect([seed, newLeft.replace(/^\uFEFF/, "")]).toEqual([seed, newRight.replace(/^\uFEFF/, "")]);
        }
      });
    }

    it("moving one block at a time, recomputing in between, also ends with equal texts", () => {
      for (let seed = 1; seed <= 200; seed++) {
        const next = random(seed);
        let left = randomText(next, 20);
        const right = editText(next, left);
        const options = pick(next, OPTION_SETS);
        for (let step = 0; step < 50; step++) {
          const diff = compareTexts(left, right, options);
          const first = changeIndexes(diff)[0];
          if (first === undefined) break;
          left = applyBlock(left, right, diff, first, "to-left", options);
        }
        expect([seed, changes(left, right, options)]).toEqual([seed, 0]);
      }
    });
  });
});
