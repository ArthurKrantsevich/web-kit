const JSON_NUMBER = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

/** value = sign × digits × 10^exp, with `digits` free of trailing zeros. */
interface Decimal {
  sign: -1 | 0 | 1;
  digits: bigint;
  exp: number;
  length: number;
}

function toDecimal(raw: string): Decimal {
  const match = JSON_NUMBER.exec(raw);
  if (!match) throw new TypeError(`Not a JSON number: ${raw}`);
  const fraction = match[3] ?? "";
  const all = (match[2]! + fraction).replace(/^0+/, "");
  if (all === "") return { sign: 0, digits: 0n, exp: 0, length: 0 };
  const trimmed = all.replace(/0+$/, "");
  const exp = Number(match[4] ?? "0") - fraction.length + (all.length - trimmed.length);
  return { sign: match[1] === "-" ? -1 : 1, digits: BigInt(trimmed), exp, length: trimmed.length };
}

/** Compares two JSON number spellings exactly: "1.0" equals "1", big integers keep every digit. */
export function compareNumbers(a: string, b: string): -1 | 0 | 1 {
  const x = toDecimal(a);
  const y = toDecimal(b);
  if (x.sign !== y.sign) return x.sign < y.sign ? -1 : 1;
  if (x.sign === 0) return 0;
  const magnitude = compareMagnitude(x, y);
  if (magnitude === 0) return 0;
  return x.sign === 1 ? magnitude : magnitude === 1 ? -1 : 1;
}

function compareMagnitude(x: Decimal, y: Decimal): -1 | 0 | 1 {
  // Position of the leading digit decides unless both are equal; then the shift is at most the digit count.
  const orderX = x.length + x.exp;
  const orderY = y.length + y.exp;
  if (orderX !== orderY) return orderX > orderY ? 1 : -1;
  const shift = x.exp - y.exp;
  const left = shift > 0 ? x.digits * 10n ** BigInt(shift) : x.digits;
  const right = shift < 0 ? y.digits * 10n ** BigInt(-shift) : y.digits;
  return left === right ? 0 : left > right ? 1 : -1;
}

/** True when a / b is an integer, computed exactly. A zero divisor is never valid. */
export function isMultipleOf(a: string, b: string): boolean {
  const x = toDecimal(a);
  const y = toDecimal(b);
  if (y.sign === 0) return false;
  if (x.sign === 0) return true;
  const k = x.exp - y.exp;
  // x.digits has no trailing zeros, so it cannot be divisible by 10^-k for k < 0.
  if (k < 0) return false;
  return (x.digits * modPow(10n, BigInt(k), y.digits)) % y.digits === 0n;
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  if (modulus === 1n) return 0n;
  let result = 1n;
  let b = base % modulus;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus;
    b = (b * b) % modulus;
    e >>= 1n;
  }
  return result;
}
