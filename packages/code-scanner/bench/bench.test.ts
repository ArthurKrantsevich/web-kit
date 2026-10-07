// @vitest-environment node
import { describe, expect, it } from "vitest";
import { zxing } from "../test/zxing";
import { scan } from "../src/core/scan";
import { qrFamily } from "../src/qr/family";
import { corpusAvailable, FALSE_POSITIVE_CATEGORIES, loadCategory, QR_CATEGORIES, rotated } from "./corpus";
import { rivalSymbols, verdict } from "./run";
import { stressCorpus } from "./stress";

const available = corpusAvailable();
const describeCorpus = available ? describe : describe.skip;

// The comparisons against zxing-wasm live here, behind the corpus cache, so a loaded CI runner or a zxing-wasm bump can
// never turn CI red: CI checks the stress corpus itself (below), the benchmark checks who reads it better.
describeCorpus("the ZXing black-box corpus (cached by bench:fetch; skipped without it)", () => {
  it("reads at least as many QR images as zxing-wasm over the categories at four rotations, with no misreads in any", async () => {
    const zx = await zxing();
    // 10 images per category: the totals are compared, not each category, since a category of 10 is too few to rank
    // (the full benchmark, `pnpm bench`, compares each category over all its images)
    const totals: Record<string, number> = {};
    let ours = 0, rival = 0;
    for (const category of QR_CATEGORIES) {
      const images = await loadCategory(category, 10);
      let misreads = 0;
      for (const img of images) for (let turn = 0; turn < 4; turn++) {
        const image = rotated(img.image, turn), expected = [img.expected!];
        const found = scan(image, { decoders: [qrFamily], tryHarder: true, deadlineMs: 2000 }).map((r) => r.text);
        const a = verdict(found, expected);
        if (a === "hit") ours++; else if (a === "misread") misreads++;
        const theirs = (await zx.read(image, { maxSymbols: rivalSymbols(expected) })).map((r) => r.text);
        if (verdict(theirs, expected) === "hit") rival++;
      }
      totals[category] = ours;
      expect([category, misreads]).toEqual([category, 0]);
    }
    expect([ours >= rival, ours, rival, totals]).toEqual([true, ours, rival, totals]);
  }, 300_000);

  it("reports nothing on the false-positive folders", async () => {
    for (const category of FALSE_POSITIVE_CATEGORIES) {
      for (const img of await loadCategory(category, 10)) for (let turn = 0; turn < 4; turn++) {
        expect([category, img.name, turn, scan(rotated(img.image, turn), { decoders: [qrFamily], tryHarder: true, deadlineMs: 2000 })]).toEqual([category, img.name, turn, []]);
      }
    }
  }, 300_000);

  it("reads the stress corpus better than zxing-wasm in total, with no misreads", async () => {
    const zx = await zxing();
    let ours = 0, rival = 0, misreads = 0;
    for (const c of stressCorpus(1)) {
      const found = scan(c.image, { decoders: [qrFamily], tryHarder: true, multiple: c.expected.length > 1, deadlineMs: 2000 }).map((r) => r.text);
      const a = verdict(found, c.expected);
      if (a === "hit") ours++; else if (a === "misread") misreads++;
      const theirs = (await zx.read(c.image, { maxSymbols: rivalSymbols(c.expected) })).map((r) => r.text);
      if (verdict(theirs, c.expected) === "hit") rival++;
    }
    expect(misreads).toBe(0);
    expect([ours > rival, ours, rival]).toEqual([true, ours, rival]);
  }, 300_000);
});

describe("the stress corpus", () => {
  it("is deterministic and covers the spec's categories", () => {
    const a = stressCorpus(1), b = stressCorpus(1);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    const samePixels = a.map((c, i) => Buffer.from(c.image.data.buffer, c.image.data.byteOffset, c.image.data.byteLength).equals(Buffer.from(b[i]!.image.data.buffer, b[i]!.image.data.byteOffset, b[i]!.image.data.byteLength)));
    expect(samePixels.every(Boolean)).toBe(true);
    expect(new Set(a.map((c) => c.category))).toEqual(new Set(["rotation", "perspective", "blur", "noise", "contrast", "gradient", "glare", "damage", "inverted", "mirrored", "cylinder", "tiny", "dense", "several"]));
    expect(a.length).toBeGreaterThanOrEqual(60);
  }, 60_000);
});

describe("the verdict", () => {
  it("judges both sides by the same multiset rule", () => {
    expect(verdict(["a"], ["a"])).toBe("hit");
    expect(verdict(["b", "a"], ["a", "b"])).toBe("hit");
    expect(verdict(["a", "a", "b"], ["a", "b", "c"])).toBe("misread");
    expect(verdict(["a", "b"], ["a"])).toBe("misread");
    expect(verdict([], ["a"])).toBe("miss");
    expect(verdict([], null)).toBe("clean");
    expect(verdict(["a"], null)).toBe("misread");
    expect([rivalSymbols(["a"]), rivalSymbols(["a", "b"]), rivalSymbols(null)]).toEqual([1, 255, 1]);
  });
});
