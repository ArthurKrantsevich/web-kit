/** log2 of a positive BigInt, to double precision, however large it is. */
export function log2Big(value: bigint): number {
  if (value <= 0n) return 0;
  const bits = value.toString(2).length;
  if (bits <= 53) return Math.log2(Number(value));
  return Math.log2(Number(value >> BigInt(bits - 53))) + (bits - 53);
}
