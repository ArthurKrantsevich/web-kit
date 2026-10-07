/** Writes bits most significant first; `toBytes` packs them from the top of each byte. */
export class BitWriter {
  readonly bits: number[] = [];
  put(value: number, count: number): this {
    for (let i = count - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
    return this;
  }
  get length(): number {
    return this.bits.length;
  }
  toBytes(totalBits: number = this.bits.length): Uint8Array {
    const out = new Uint8Array(Math.ceil(totalBits / 8));
    for (let i = 0; i < this.bits.length; i++) if (this.bits[i]) out[i >> 3] = out[i >> 3]! | (0x80 >> (i & 7));
    return out;
  }
}
