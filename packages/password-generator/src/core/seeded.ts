import type { RandomSource } from "./types";

// Test helpers: random sources whose output a test knows. Not part of the package's API.

/** A deterministic, well-mixed source (splitmix32) for statistical tests that must not flake. */
export function seededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return (values) => {
    for (let i = 0; i < values.length; i++) {
      state = (state + 0x9e3779b9) >>> 0;
      let z = state;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      values[i] = (z ^ (z >>> 16)) >>> 0;
    }
  };
}

/** Hands out the given 32-bit values in order, then zeros. */
export function scriptedRandom(list: readonly number[]): RandomSource {
  let at = 0;
  return (values) => {
    for (let i = 0; i < values.length; i++) values[i] = list[at++] ?? 0;
  };
}

/** Pearson's χ² of observed counts against equal expected counts. */
export function chiSquare(counts: readonly number[]): number {
  const total = counts.reduce((sum, count) => sum + count, 0);
  const expected = total / counts.length;
  return counts.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0);
}
