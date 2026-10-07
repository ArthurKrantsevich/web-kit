// @vitest-environment node
import { describe, expect, it } from "vitest";
import { bchDecode, bchEncode } from "./bch";
import { gf1024, gf16, gf256Dm, gf256Qr, gf4096, gf64, gf929, rsEncode, type GenericGF } from "./gf";
import { rsDecode } from "./rs";

/** xorshift32 in [0, 1): seeded, so every run draws the same errors. */
function xorshift(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
const FIELDS: [string, GenericGF][] = [["GF(256) 0x11D", gf256Qr()], ["GF(256) 0x12D", gf256Dm()], ["GF(16)", gf16()], ["GF(64)", gf64()], ["GF(1024)", gf1024()], ["GF(4096)", gf4096()], ["GF(929)", gf929()]];

describe("GenericGF", () => {
  it("has exp and log as inverses, α^(q−1) = 1, and a·a⁻¹ = 1 in every field", () => {
    for (const [name, gf] of FIELDS) {
      for (let v = 1; v < gf.size; v++) expect([name, gf.alpha(gf.log(v))]).toEqual([name, v]);
      expect([name, gf.alpha(gf.size - 1)]).toEqual([name, 1]);
      for (let v = 1; v < Math.min(gf.size, 300); v++) expect([name, gf.mul(v, gf.inv(v))]).toEqual([name, 1]);
    }
  });

  it("adds and multiplies as a prime field in GF(929) and as a polynomial field in GF(256)", () => {
    const p = gf929(), q = gf256Qr();
    expect([p.add(900, 50), p.sub(10, 20), p.mul(3, 3), p.neg(1)]).toEqual([21, 919, 9, 928]);
    expect([q.add(0xff, 0x0f), q.mul(2, 0x80), q.neg(5)]).toEqual([0xf0, 0x1d, 5]);
  });
});

describe("Reed–Solomon encoding", () => {
  it("gives ISO/IEC 18004 Annex I's check symbols for the 1-M example", () => {
    const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
    expect(rsEncode(gf256Qr(), data, 10).slice(16)).toEqual([0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55]);
  });

  it("makes codewords with zero syndromes in a prime field too", () => {
    const gf = gf929(), code = rsEncode(gf, [1, 2, 3, 4, 5], 4);
    expect(code).toHaveLength(9);
    expect(rsDecode(gf, code, 4)).toEqual({ corrected: 0, erasures: 0 });
  });
});

describe("rsDecode", () => {
  it("corrects every e errors and s erasures with 2e + s ≤ 2t, counting them exactly, in every field", () => {
    let trials = 0;
    for (const [name, gf] of FIELDS) {
      const rnd = xorshift(name.length * 7919 + 1);
      const n = Math.min(gf.size - 1, 60), ec = gf.size === 16 ? 6 : 16;
      for (let trial = 0; trial < 150; trial++) {
        const data = Array.from({ length: n - ec }, () => Math.floor(rnd() * gf.size));
        const code = rsEncode(gf, data, ec);
        const s = Math.floor(rnd() * (ec + 1)), e = Math.floor(rnd() * (Math.floor((ec - s) / 2) + 1));
        const positions = new Set<number>();
        while (positions.size < e + s) positions.add(Math.floor(rnd() * n));
        const pos = [...positions], erasures = pos.slice(0, s), received = code.slice();
        for (const p of pos) { let v: number; do v = Math.floor(rnd() * gf.size); while (v === code[p]); received[p] = v; }
        const result = rsDecode(gf, received, ec, erasures);
        expect([name, trial, result, received]).toEqual([name, trial, { corrected: e, erasures: s }, code]);
        trials++;
      }
    }
    expect(trials).toBe(1050);
  });

  it("refuses t + 1 errors (a chance coincidence with another codeword is under 3 %), and never claims more than t", () => {
    const gf = gf256Qr(), rnd = xorshift(99), n = 60, ec = 16, t = 8;
    let accepted = 0;
    for (let trial = 0; trial < 500; trial++) {
      const code = rsEncode(gf, Array.from({ length: n - ec }, () => Math.floor(rnd() * 256)), ec);
      const positions = new Set<number>();
      while (positions.size < t + 1) positions.add(Math.floor(rnd() * n));
      const received = code.slice();
      for (const p of positions) { let v: number; do v = Math.floor(rnd() * 256); while (v === code[p]); received[p] = v; }
      const result = rsDecode(gf, received, ec);
      if (result !== null) { accepted++; expect(result.corrected).toBeLessThanOrEqual(t); }
    }
    expect(accepted).toBeLessThan(15);
  });

  it("refuses more erasures than check symbols, and ignores repeated or out-of-range erasure positions", () => {
    const gf = gf256Qr(), code = rsEncode(gf, [1, 2, 3], 4);
    const received = code.slice();
    received[1] = received[1]! ^ 0x55;
    expect(rsDecode(gf, received.slice(), 4, [0, 1, 2, 3, 4])).toBeNull();
    expect(rsDecode(gf, received, 4, [1, 1, 99, -1])).toEqual({ corrected: 0, erasures: 1 });
    expect(received).toEqual(code);
    // a clean word needs no correction, whatever erasures are claimed
    expect(rsDecode(gf, code.slice(), 4, [0, 1, 2])).toEqual({ corrected: 0, erasures: 0 });
  });
});

describe("BCH", () => {
  it("encodes QR format information as ISO/IEC 18004 Annex C: level M, mask 5 → 0x40CE after the XOR mask", () => {
    // M = 00, mask 101 → data 00101; data << 10 | remainder = 00101 0011011100 = 0x14DC; ⊕ 0x5412 = 0x40CE
    expect(bchEncode(0b00101, 5, 15, 0x537) ^ 0x5412).toBe(0x40ce);
    // version 7 → 000111 110010010100 (ISO Annex D)
    expect(bchEncode(7, 6, 18, 0x1f25)).toBe(0b000111110010010100);
  });

  it("decodes the nearest code within the distance and refuses beyond it; within 3 the nearest is always unique", () => {
    const code = bchEncode(0b00101, 5, 15, 0x537) ^ 0x5412;
    expect(bchDecode(code, 5, 15, 0x537, 0x5412, 3)).toEqual({ data: 0b00101, distance: 0, second: null });
    expect(bchDecode(code ^ 0b101, 5, 15, 0x537, 0x5412, 3)).toEqual({ data: 0b00101, distance: 2, second: null });
    expect(bchDecode(code ^ 0b1010101, 5, 15, 0x537, 0x5412, 3)).toBeNull();
    // both BCH codes have minimum distance 7: a tie (`second`) can only appear at distance 4 or more
    for (let bits = 0; bits < 1 << 15; bits += 37) expect(bchDecode(bits, 5, 15, 0x537, 0x5412, 3)?.second ?? null).toBeNull();
    expect(bchDecode(bchEncode(7, 6, 18, 0x1f25) ^ 0b11, 6, 18, 0x1f25, 0, 3)).toEqual({ data: 7, distance: 2, second: null });
  });
});
