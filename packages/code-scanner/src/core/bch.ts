/** The n-bit BCH code of a k-bit value: data in the high bits, the remainder of data·x^(n−k) by `poly` below. */
export function bchEncode(data: number, k: number, n: number, poly: number): number {
  let rem = data;
  for (let i = 0; i < n - k; i++) rem = (rem << 1) ^ ((rem >>> (n - k - 1)) & 1 ? poly : 0);
  return (data << (n - k)) | (rem & ((1 << (n - k)) - 1));
}

export interface BchMatch {
  data: number;
  distance: number;
  /** Another data value at the same distance, when the nearest is not unique. */
  second: number | null;
}

/** The nearest valid code (after the XOR `mask`) to `bits` by Hamming distance, within `maxDistance`, else null. */
export function bchDecode(bits: number, k: number, n: number, poly: number, mask: number, maxDistance: number): BchMatch | null {
  let best = 0, bestDistance = 99, second: number | null = null;
  for (let data = 0; data < 1 << k; data++) {
    let x = (bchEncode(data, k, n, poly) ^ mask) ^ bits, distance = 0;
    while (x !== 0) { distance += x & 1; x >>>= 1; }
    if (distance < bestDistance) { bestDistance = distance; best = data; second = null; }
    else if (distance === bestDistance) second = data;
  }
  return bestDistance <= maxDistance ? { data: best, distance: bestDistance, second } : null;
}
