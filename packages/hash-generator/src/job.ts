import { hashAll } from "./core/hash";
import type { AlgorithmId, HashResults, HmacKey } from "./core/types";
import { ALL_ALGORITHMS } from "./extra/index";

/** One part of hashing a file: some algorithms over the whole Blob. Several workers can take a file at once. */
export interface HashJob {
  blob: Blob;
  algorithms: AlgorithmId[];
  hmacKey: HmacKey | null;
}

export interface HashWorkerRequest {
  id: number;
  job: HashJob;
}

/** Bytes read so far, the digests, or why it failed (a message without the data). */
export type HashWorkerResponse = { id: number; done: number } | { id: number; digests: HashResults } | { id: number; error: string };

/** What the worker does with one message: it reads the Blob once, part by part, and reports progress after each part. */
export async function answerHashJob(request: HashWorkerRequest, post: (response: HashWorkerResponse) => void): Promise<void> {
  const { id, job } = request;
  try {
    const algorithms = ALL_ALGORITHMS.filter((algorithm) => job.algorithms.includes(algorithm.id));
    const result = await hashAll(job.blob, {
      algorithms,
      hmacKey: job.hmacKey ?? undefined,
      onProgress: (done) => post({ id, done }),
    });
    post(result.ok ? { id, digests: result.value } : { id, error: result.error.message });
  } catch {
    post({ id, error: "Could not hash the file" });
  }
}

/**
 * Relative cost per byte of each algorithm (measured in V8: MD5 about 180 MB/s, SHA3-512 about 24 MB/s). Web Crypto's
 * four share one worker, which also keeps the file's copy they need.
 */
export const COST: Readonly<Record<AlgorithmId, number>> = {
  md5: 5,
  crc32: 4.5,
  sha1: 2,
  sha256: 2,
  sha384: 2,
  sha512: 2,
  sha224: 10,
  "sha512-256": 20,
  "sha3-224": 23,
  "sha3-256": 23,
  "sha3-384": 29,
  "sha3-512": 42,
  "blake2b-512": 29,
  "blake2s-256": 19,
  "blake3-256": 22,
  ripemd160: 17.5,
  crc32c: 4.5,
};

const WEB_CRYPTO: readonly AlgorithmId[] = ["sha1", "sha256", "sha384", "sha512"];

/**
 * Splits the algorithms into at most `count` groups of about the same cost (the largest first, each into the lightest
 * group), keeping the Web Crypto ones together. Groups keep the order of `ids`; empty groups are dropped.
 */
export function planGroups(ids: readonly AlgorithmId[], count: number): AlgorithmId[][] {
  const web = ids.filter((id) => WEB_CRYPTO.includes(id));
  const units: AlgorithmId[][] = [...(web.length > 0 ? [web] : []), ...ids.filter((id) => !WEB_CRYPTO.includes(id)).map((id) => [id])];
  const cost = (unit: AlgorithmId[]) => unit.reduce((sum, id) => sum + COST[id], 0);
  units.sort((a, b) => cost(b) - cost(a));
  const groups: { ids: AlgorithmId[]; cost: number }[] = Array.from({ length: Math.max(1, count) }, () => ({ ids: [], cost: 0 }));
  for (const unit of units) {
    const lightest = groups.reduce((best, group) => (group.cost < best.cost ? group : best));
    lightest.ids.push(...unit);
    lightest.cost += cost(unit);
  }
  return groups.filter((group) => group.ids.length > 0).map((group) => ids.filter((id) => group.ids.includes(id)));
}
