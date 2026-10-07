// @vitest-environment node
import { describe, expect, it } from "vitest";
import { zxing } from "../test/zxing";
import { scan } from "../src/core/scan";
import { qrFamily } from "../src/qr/family";
import { corpusAvailable, FALSE_POSITIVE_CATEGORIES, loadCategory, QR_CATEGORIES, rotated } from "./corpus";
import { stressCorpus } from "./stress";

const available = corpusAvailable();
const describeCorpus = available ? describe : describe.skip;

describeCorpus("the ZXing black-box corpus (cached by bench:fetch; skipped without it)", () => {
  it("reads at least as many QR images as zxing-wasm in every category at four rotations, with no misreads", async () => {
    const zx = await zxing();
    for (const category of QR_CATEGORIES) {
      const images = await loadCategory(category, 10);
      let ours = 0, rival = 0, misreads = 0;
      for (const img of images) for (let turn = 0; turn < 4; turn++) {
        const image = rotated(img.image, turn);
        const ourResult = scan(image, { decoders: [qrFamily], tryHarder: true, deadlineMs: 2000 })[0];
        if (ourResult) { if (ourResult.text === img.expected) ours++; else misreads++; }
        const theirs = (await zx.read(image))[0];
        if (theirs && theirs.text === img.expected) rival++;
      }
      expect([category, misreads]).toEqual([category, 0]);
      expect([category, ours >= rival, ours, rival]).toEqual([category, true, ours, rival]);
    }
  }, 300_000);

  it("reports nothing on the false-positive folders", async () => {
    for (const category of FALSE_POSITIVE_CATEGORIES) {
      for (const img of await loadCategory(category, 10)) for (let turn = 0; turn < 4; turn++) {
        expect([category, img.name, turn, scan(rotated(img.image, turn), { decoders: [qrFamily], tryHarder: true, deadlineMs: 2000 })]).toEqual([category, img.name, turn, []]);
      }
    }
  }, 300_000);
});

describe("the stress corpus", () => {
  it("is deterministic, covers the spec's categories, and is read better than by zxing-wasm in total", async () => {
    const a = stressCorpus(1), b = stressCorpus(1);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    expect(new Set(a.map((c) => c.category))).toEqual(new Set(["rotation", "perspective", "blur", "noise", "contrast", "gradient", "glare", "damage", "inverted", "mirrored", "cylinder", "tiny", "dense", "several"]));
    expect(a.length).toBeGreaterThanOrEqual(60);
    const zx = await zxing();
    let ours = 0, rival = 0, misreads = 0;
    for (const c of a) {
      const found = scan(c.image, { decoders: [qrFamily], tryHarder: true, multiple: c.expected.length > 1, deadlineMs: 2000 }).map((r) => r.text);
      if (found.every((t) => c.expected.includes(t))) ours += found.length === c.expected.length ? 1 : 0; else misreads++;
      const theirs = (await zx.read(c.image)).map((r) => r.text);
      if (theirs.length === c.expected.length && theirs.every((t) => c.expected.includes(t))) rival++;
    }
    expect(misreads).toBe(0);
    expect([ours > rival, ours, rival]).toEqual([true, ours, rival]);
  }, 300_000);
});
