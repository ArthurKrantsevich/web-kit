/** Crockford's Base32 as ULID uses it: no I, L, O or U. */
export const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** `length` characters of Crockford Base32 for the low `length × 5` bits of `value`. */
export function encodeCrockford(value: bigint, length: number): string {
  let text = "";
  for (let i = 0; i < length; i++) {
    text = CROCKFORD[Number(value & 31n)]! + text;
    value >>= 5n;
  }
  return text;
}

/** The number a string of Crockford Base32 digits stands for (callers pass checked text; any case). */
export function decodeCrockford(text: string): bigint {
  let value = 0n;
  for (const char of text.toUpperCase()) value = (value << 5n) | BigInt(CROCKFORD.indexOf(char));
  return value;
}
