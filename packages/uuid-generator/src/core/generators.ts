import { formatBytes, stamp } from "./bytes";
import { encodeCrockford } from "./crockford";
import { makeNanoid, type NanoidOptions } from "./nanoid";
import { cryptoRandom, randomBytes } from "./random";
import { makeV4 } from "./uuid";
import type { RandomSource, Result } from "./types";

/** 100-ns intervals from the start of the Gregorian calendar (1582-10-15) to the Unix epoch (RFC 9562 §5.1). */
export const GREGORIAN_OFFSET = 122_192_928_000_000_000n;

/** The largest time a 48-bit millisecond field holds: v7 and ULID. */
export const MAX_MS: number = 2 ** 48 - 1;
/** The last millisecond whose 100-ns count from 1582 fits v1's and v6's 60-bit field (in the year 5236). */
export const MAX_GREGORIAN_MS: number = Number(((1n << 60n) - 1n - GREGORIAN_OFFSET) / 10_000n);

/** A time in whole milliseconds, floored; a RangeError when it is not a number from 0 to `max`. */
function wholeMs(now: number, max: number): number {
  const ms = Math.floor(now);
  if (!(ms >= 0 && ms <= max)) throw new RangeError(`The time must be from 0 to ${max} ms after 1970-01-01; it is ${now}`);
  return ms;
}

export interface IdSource {
  random: RandomSource;
  /** Unix time in milliseconds. */
  now: () => number;
}

/**
 * Generators with their own state: v7, ULID, v1 and v6 values of one set strictly increase. A `now` they are given is
 * floored to whole milliseconds; outside 0 to 2⁴⁸ − 1 (v1 and v6: past the year 5236) it is a RangeError.
 */
export interface IdGenerators {
  uuidV4(): string;
  /** 48-bit Unix milliseconds, a 12-bit counter with a random start each millisecond, 62 random bits. */
  uuidV7(now?: number): string;
  /** Gregorian 100-ns time, a random clock sequence, a random node with the multicast bit set. */
  uuidV1(now?: number): string;
  /** v1's fields ordered for sorting. */
  uuidV6(now?: number): string;
  /** 48-bit Unix milliseconds and 80 random bits in Crockford Base32; within one millisecond the random part counts up. */
  ulid(now?: number): string;
  nanoid(options?: NanoidOptions): Result<string>;
}

/** A fresh set of generators. The default source is `crypto.getRandomValues` and `Date.now`. */
export function createIdGenerators(source: Partial<IdSource> = {}): IdGenerators {
  const random = source.random ?? cryptoRandom;
  const clock = source.now ?? Date.now;

  // v7: RFC 9562 §6.2, method 1 (a 12-bit counter in rand_a).
  let v7Ms = -1;
  let v7Counter = 0;
  function uuidV7(time = clock()): string {
    const now = wholeMs(time, MAX_MS);
    const fresh = randomBytes(random, 10);
    if (now > v7Ms) {
      v7Ms = now;
      v7Counter = ((fresh[0]! << 8) | fresh[1]!) & 0xfff;
    } else if (++v7Counter > 0xfff) {
      // The counter ran out in this millisecond (or the clock went back): borrow the next millisecond.
      v7Ms += 1;
      v7Counter = ((fresh[0]! << 8) | fresh[1]!) & 0xfff;
    }
    const bytes = new Uint8Array(16);
    let ms = v7Ms;
    for (let i = 5; i >= 0; i--) {
      bytes[i] = ms % 256;
      ms = Math.floor(ms / 256);
    }
    bytes[6] = v7Counter >> 8;
    bytes[7] = v7Counter & 0xff;
    bytes.set(fresh.subarray(2), 8);
    return formatBytes(stamp(bytes, 7));
  }

  // v1 and v6 share one clock sequence and node, drawn once, and one strictly increasing 100-ns time.
  let v1Tick = -1n;
  let clockSequence = -1;
  let node: Uint8Array | null = null;
  function timeFields(now: number): { tick: bigint; sequence: number; node: Uint8Array } {
    if (node === null) {
      const drawn = randomBytes(random, 8);
      clockSequence = ((drawn[0]! << 8) | drawn[1]!) & 0x3fff;
      node = drawn.slice(2);
      // RFC 9562 §6.10: a random node has the multicast bit (the lowest bit of its first byte) set.
      node[0]! |= 0x01;
    }
    const tick = BigInt(wholeMs(now, MAX_GREGORIAN_MS)) * 10_000n + GREGORIAN_OFFSET;
    v1Tick = tick > v1Tick ? tick : v1Tick + 1n;
    return { tick: v1Tick, sequence: clockSequence, node };
  }
  function withClock(bytes: Uint8Array, sequence: number, nodeBytes: Uint8Array): void {
    bytes[8] = sequence >> 8;
    bytes[9] = sequence & 0xff;
    bytes.set(nodeBytes, 10);
  }
  function uuidV1(now = clock()): string {
    const { tick, sequence, node: nodeBytes } = timeFields(now);
    const bytes = new Uint8Array(16);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, Number(tick & 0xffffffffn));
    view.setUint16(4, Number((tick >> 32n) & 0xffffn));
    view.setUint16(6, Number((tick >> 48n) & 0x0fffn));
    withClock(bytes, sequence, nodeBytes);
    return formatBytes(stamp(bytes, 1));
  }
  function uuidV6(now = clock()): string {
    const { tick, sequence, node: nodeBytes } = timeFields(now);
    const bytes = new Uint8Array(16);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, Number(tick >> 28n));
    view.setUint16(4, Number((tick >> 12n) & 0xffffn));
    view.setUint16(6, Number(tick & 0x0fffn));
    withClock(bytes, sequence, nodeBytes);
    return formatBytes(stamp(bytes, 6));
  }

  // ULID: the random part of the last ID, to count up from within one millisecond.
  let ulidMs = -1;
  let ulidRandom = 0n;
  const MAX_RANDOM = (1n << 80n) - 1n;
  function ulid(time = clock()): string {
    const now = wholeMs(time, MAX_MS);
    if (now > ulidMs || ulidRandom === MAX_RANDOM) {
      // A new millisecond, or the random part cannot count up any more: then the next millisecond (the ULID library
      // throws instead; moving on keeps the order, as v7 does).
      ulidMs = now > ulidMs ? now : ulidMs + 1;
      ulidRandom = randomBytes(random, 10).reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);
    } else {
      ulidRandom += 1n;
    }
    return encodeCrockford(BigInt(ulidMs), 10) + encodeCrockford(ulidRandom, 16);
  }

  return {
    uuidV4: () => makeV4(random),
    uuidV7,
    uuidV1,
    uuidV6,
    ulid,
    nanoid: (options) => makeNanoid(random, options),
  };
}
