// @vitest-environment node
/// <reference types="node" />
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hashAll } from "../core/hash";
import { matchDigest } from "../core/match";
import type { AlgorithmId, HashResults } from "../core/types";
import { ALL_ALGORITHMS } from "../extra/index";
import { checksumFile } from "./sums";

async function hello(): Promise<HashResults> {
  const result = await hashAll("hello", { algorithms: ALL_ALGORITHMS });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}
const rows = (results: HashResults) => ALL_ALGORITHMS.map((algorithm) => ({ id: algorithm.id as AlgorithmId, digest: results[algorithm.id]! }));
/** coreutils' cksum, when this machine has it (not on every CI runner or developer machine). */
const coreutils = spawnSync("cksum", ["--version"], { encoding: "utf8" }).stdout?.includes("GNU coreutils") ?? false;

describe("hashes.txt", () => {
  it("has one BSD tagged line per algorithm, named as cksum -a names them where it can", async () => {
    const results = await hello();
    const lines = checksumFile(rows(results), "hello.txt").split("\n");
    expect(lines.map((line) => line.replace(/ = [0-9a-f]+$/, ""))).toEqual([
      "MD5 (hello.txt)",
      "SHA1 (hello.txt)",
      "SHA256 (hello.txt)",
      "SHA384 (hello.txt)",
      "SHA512 (hello.txt)",
      "CRC32 (hello.txt)",
      "SHA224 (hello.txt)",
      "SHA512t256 (hello.txt)",
      "SHA3-224 (hello.txt)",
      "SHA3-256 (hello.txt)",
      "SHA3-384 (hello.txt)",
      "SHA3-512 (hello.txt)",
      "BLAKE2b (hello.txt)",
      "BLAKE2s (hello.txt)",
      "BLAKE3 (hello.txt)",
      "RMD160 (hello.txt)",
      "CRC32C (hello.txt)",
      "",
    ]);
    expect(lines[2]).toBe("SHA256 (hello.txt) = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("gives each line back to Verify as its own algorithm", async () => {
    const results = await hello();
    for (const [index, line] of checksumFile(rows(results), "hello.txt").trim().split("\n").entries()) {
      expect([line, matchDigest(line, results)]).toEqual([line, { status: "match", algorithm: ALL_ALGORITHMS[index]!.id }]);
    }
  });

  it.skipIf(!coreutils)("passes cksum -c, and each of md5sum, sha1sum, sha224sum, sha256sum, sha384sum, sha512sum and b2sum -c", async () => {
    const results = await hello();
    const dir = mkdtempSync(join(tmpdir(), "wk-hashes-"));
    try {
      writeFileSync(join(dir, "hello.txt"), "hello");
      writeFileSync(join(dir, "hashes.txt"), checksumFile(rows(results), "hello.txt"));
      const run = (tool: string) => spawnSync(tool, ["-c", "hashes.txt"], { cwd: dir, encoding: "utf8", env: { ...process.env, LC_ALL: "C" } });
      const cksum = run("cksum");
      // cksum knows MD5, SHA1, SHA224 to SHA512 and BLAKE2b here; it warns about the lines it does not know, and none fails.
      expect([cksum.status, cksum.stdout.trim().split("\n")]).toEqual([0, Array(7).fill("hello.txt: OK")]);
      for (const tool of ["md5sum", "sha1sum", "sha224sum", "sha256sum", "sha384sum", "sha512sum", "b2sum"]) {
        const one = run(tool);
        expect([tool, one.status, one.stdout.trim()]).toEqual([tool, 0, "hello.txt: OK"]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
