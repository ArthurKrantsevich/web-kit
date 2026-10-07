/**
 * A Galois field GF(q): q = 2^m with a primitive polynomial (QR, Data Matrix, Aztec, MaxiCode), or q prime (PDF417's
 * GF(929), where the generator is a primitive element). `generatorBase` is the power of α of the first root of the
 * Reed–Solomon generator polynomial (0 for QR, 1 for the others).
 */
export class GenericGF {
  readonly size: number;
  readonly generatorBase: number;
  readonly prime: boolean;
  private readonly expTable: Int32Array;
  private readonly logTable: Int32Array;

  constructor(size: number, primitive: number, generatorBase: number, prime: boolean = false) {
    this.size = size;
    this.generatorBase = generatorBase;
    this.prime = prime;
    this.expTable = new Int32Array(size * 2);
    this.logTable = new Int32Array(size);
    let x = 1;
    for (let i = 0; i < size - 1; i++) {
      this.expTable[i] = x;
      this.logTable[x] = i;
      x = prime ? (x * primitive) % size : (x << 1) ^ (x >= size >> 1 ? primitive : 0);
    }
    for (let i = size - 1; i < size * 2; i++) this.expTable[i] = this.expTable[i - (size - 1)]!;
  }
  add(a: number, b: number): number { return this.prime ? (a + b) % this.size : a ^ b; }
  sub(a: number, b: number): number { return this.prime ? (a - b + this.size) % this.size : a ^ b; }
  neg(a: number): number { return this.prime ? (this.size - a) % this.size : a; }
  mul(a: number, b: number): number { return a === 0 || b === 0 ? 0 : this.expTable[this.logTable[a]! + this.logTable[b]!]!; }
  inv(a: number): number { return this.expTable[this.size - 1 - this.logTable[a]!]!; }
  log(a: number): number { return this.logTable[a]!; }
  /** α^i for any integer i (negative too). */
  alpha(i: number): number {
    const order = this.size - 1;
    let e = i % order;
    if (e < 0) e += order;
    return this.expTable[e]!;
  }
  /** a^n for any integer n. */
  pow(a: number, n: number): number { return a === 0 ? 0 : this.alpha(this.logTable[a]! * n); }
}

const memo = (make: () => GenericGF): (() => GenericGF) => {
  let field: GenericGF | null = null;
  return () => (field ??= make());
};
/** QR Code: GF(256), x⁸ + x⁴ + x³ + x² + 1, first root α⁰. */
export const gf256Qr: () => GenericGF = memo(() => new GenericGF(256, 0x11d, 0));
/** Data Matrix and 8-bit Aztec: GF(256), x⁸ + x⁵ + x³ + x² + 1, first root α¹. */
export const gf256Dm: () => GenericGF = memo(() => new GenericGF(256, 0x12d, 1));
export const gf16: () => GenericGF = memo(() => new GenericGF(16, 0x13, 1));
export const gf64: () => GenericGF = memo(() => new GenericGF(64, 0x43, 1));
export const gf1024: () => GenericGF = memo(() => new GenericGF(1024, 0x409, 1));
export const gf4096: () => GenericGF = memo(() => new GenericGF(4096, 0x1069, 1));
/** PDF417: the prime field GF(929), generator 3, first root α¹. */
export const gf929: () => GenericGF = memo(() => new GenericGF(929, 3, 1, true));

/** Polynomials are arrays of coefficients, index = degree. */
export function polyMul(gf: GenericGF, a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === 0) continue;
    for (let j = 0; j < b.length; j++) out[i + j] = gf.add(out[i + j]!, gf.mul(a[i]!, b[j]!));
  }
  return out;
}
export function polyEval(gf: GenericGF, p: readonly number[], x: number): number {
  let y = 0;
  for (let i = p.length - 1; i >= 0; i--) y = gf.add(gf.mul(y, x), p[i]!);
  return y;
}
/** The generator polynomial Π (x − α^(b+i)) for `ecCount` check symbols, low degree first, monic. */
export function rsGenerator(gf: GenericGF, ecCount: number): number[] {
  let g = [1];
  for (let i = 0; i < ecCount; i++) g = polyMul(gf, g, [gf.neg(gf.alpha(gf.generatorBase + i)), 1]);
  return g;
}
/** Systematic encoding: the data symbols (highest degree first) followed by `ecCount` check symbols. */
export function rsEncode(gf: GenericGF, data: readonly number[], ecCount: number): number[] {
  const g = rsGenerator(gf, ecCount), rem = new Array<number>(ecCount).fill(0);
  for (const d of data) {
    const factor = gf.add(d, rem[ecCount - 1]!);
    for (let i = ecCount - 1; i > 0; i--) rem[i] = gf.add(rem[i - 1]!, gf.neg(gf.mul(factor, g[i]!)));
    rem[0] = gf.neg(gf.mul(factor, g[0]!));
  }
  // the codeword is data·x^ec − remainder
  return [...data, ...rem.reverse().map((v) => gf.neg(v))];
}
