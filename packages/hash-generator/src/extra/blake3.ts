import { wordBytes } from "../core/md";
import type { Hasher } from "../core/types";
import { IV32 } from "./blake2";

// BLAKE3 with a 256-bit output, no key: a port of the BLAKE3 team's reference implementation. Chunks of 1024 bytes are
// hashed on their own and joined in a binary tree; a stack keeps one chaining value per complete subtree.

const CHUNK_START = 1;
const CHUNK_END = 2;
const PARENT = 4;
const ROOT = 8;
const PERMUTATION = [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8];

const state = new Int32Array(16);
const block = new Int32Array(16);
const permuted = new Int32Array(16);

function g(a: number, b: number, c: number, d: number, x: number, y: number): void {
  let va = state[a]!, vb = state[b]!, vc = state[c]!, vd = state[d]!;
  va = (va + vb + x) | 0;
  vd ^= va;
  vd = (vd >>> 16) | (vd << 16);
  vc = (vc + vd) | 0;
  vb ^= vc;
  vb = (vb >>> 12) | (vb << 20);
  va = (va + vb + y) | 0;
  vd ^= va;
  vd = (vd >>> 8) | (vd << 24);
  vc = (vc + vd) | 0;
  vb ^= vc;
  vb = (vb >>> 7) | (vb << 25);
  state[a] = va;
  state[b] = vb;
  state[c] = vc;
  state[d] = vd;
}

/**
 * The compression function: chaining value, 16 message words, counter, block length and flags → 16 words in `out`
 * (the first 8 are the next chaining value). `out` may be `cv`.
 */
function compress(cv: Int32Array, words: Int32Array, counter: number, length: number, flags: number, out: Int32Array = new Int32Array(16)): Int32Array {
  state.set(cv);
  state.set(IV32.slice(0, 4), 8);
  state[12] = counter;
  state[13] = Math.floor(counter / 0x100000000);
  state[14] = length;
  state[15] = flags;
  block.set(words);
  for (let round = 0; round < 7; round++) {
    g(0, 4, 8, 12, block[0]!, block[1]!);
    g(1, 5, 9, 13, block[2]!, block[3]!);
    g(2, 6, 10, 14, block[4]!, block[5]!);
    g(3, 7, 11, 15, block[6]!, block[7]!);
    g(0, 5, 10, 15, block[8]!, block[9]!);
    g(1, 6, 11, 12, block[10]!, block[11]!);
    g(2, 7, 8, 13, block[12]!, block[13]!);
    g(3, 4, 9, 14, block[14]!, block[15]!);
    if (round < 6) {
      for (let i = 0; i < 16; i++) permuted[i] = block[PERMUTATION[i]!]!;
      block.set(permuted);
    }
  }
  for (let i = 0; i < 8; i++) {
    const high = state[i + 8]!;
    if (out.length > 8) out[i + 8] = high ^ cv[i]!;
    out[i] = state[i]! ^ high;
  }
  return out;
}

/** What to compress last: for a chunk's final block or a parent node; with ROOT it gives the hash. */
interface Output {
  cv: Int32Array;
  words: Int32Array;
  counter: number;
  length: number;
  flags: number;
}

const chainingValue = (output: Output): Int32Array => compress(output.cv, output.words, output.counter, output.length, output.flags).slice(0, 8);

function parentOutput(left: Int32Array, right: Int32Array): Output {
  const words = new Int32Array(16);
  words.set(left);
  words.set(right, 8);
  return { cv: new Int32Array(IV32), words, counter: 0, length: 64, flags: PARENT };
}

export function createBlake3(): Hasher {
  const stack: Int32Array[] = [];
  let chunkCounter = 0;
  let cv = new Int32Array(IV32);
  const buffer = new Uint8Array(64);
  const words = new Int32Array(16);
  let filled = 0;
  let blocksDone = 0;

  const loadWords = (): void => {
    for (let i = 0; i < 16; i++) words[i] = buffer[i * 4]! | (buffer[i * 4 + 1]! << 8) | (buffer[i * 4 + 2]! << 16) | (buffer[i * 4 + 3]! << 24);
  };
  const startFlag = (): number => (blocksDone === 0 ? CHUNK_START : 0);
  const chunkOutput = (): Output => {
    buffer.fill(0, filled);
    loadWords();
    return { cv, words: words.slice(), counter: chunkCounter, length: filled, flags: startFlag() | CHUNK_END };
  };
  const addChunk = (chunkCv: Int32Array, total: number): void => {
    let merged = chunkCv;
    // After `total` chunks, one merge per trailing zero bit of `total`.
    while ((total & 1) === 0) {
      merged = chainingValue(parentOutput(stack.pop()!, merged));
      total /= 2;
    }
    stack.push(merged);
  };

  return {
    update(bytes) {
      let at = 0;
      while (at < bytes.length) {
        if (blocksDone * 64 + filled === 1024) {
          // The chunk is full and more input follows: it is not the last one.
          const chunkCv = chainingValue(chunkOutput());
          chunkCounter++;
          addChunk(chunkCv, chunkCounter);
          cv = new Int32Array(IV32);
          filled = 0;
          blocksDone = 0;
        }
        if (filled === 64) {
          loadWords();
          compress(cv, words, chunkCounter, 64, startFlag(), cv);
          blocksDone++;
          filled = 0;
        }
        const take = Math.min(64 - filled, 1024 - blocksDone * 64 - filled, bytes.length - at);
        buffer.set(bytes.subarray(at, at + take), filled);
        filled += take;
        at += take;
      }
    },
    digest() {
      let output = chunkOutput();
      for (let i = stack.length - 1; i >= 0; i--) output = parentOutput(stack[i]!, chainingValue(output));
      return wordBytes(compress(output.cv, output.words, output.counter, output.length, output.flags | ROOT).slice(0, 8), true);
    },
  };
}
