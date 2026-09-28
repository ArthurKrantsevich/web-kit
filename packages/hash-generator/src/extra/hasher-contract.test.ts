// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hashAll } from "../core/hash";
import { ALL_ALGORITHMS } from "./index";

const abc = new TextEncoder().encode("abc");

describe("every streaming hasher", () => {
  it("gives the same digest when asked twice, and refuses more input after its digest", () => {
    const own = ALL_ALGORITHMS.filter((algorithm) => algorithm.create);
    expect(own.length).toBe(13);
    for (const algorithm of own) {
      const hasher = algorithm.create!();
      hasher.update(abc);
      const first = hasher.digest();
      const again = hasher.digest();
      again[0] = (again[0]! + 1) & 0xff;
      expect([algorithm.id, hasher.digest()]).toEqual([algorithm.id, first]);
      expect(() => hasher.update(abc), algorithm.id).toThrow("already given its digest");
    }
  });
});

describe("hashAll's chunk size", () => {
  it("must be a whole number of bytes, at least 1", async () => {
    const blob = new Blob([abc]);
    for (const chunkSize of [0, -4, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect([chunkSize, await hashAll(blob, { chunkSize })]).toEqual([chunkSize, { ok: false, error: { message: "The chunk size must be a whole number of bytes, at least 1" } }]);
    }
    expect((await hashAll(blob, { chunkSize: 1 })).ok).toBe(true);
  });
});
