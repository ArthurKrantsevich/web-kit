// Downloads the ZXing black-box corpus (Apache-2.0) into bench/.corpus/ (git-ignored): the archive of the tag in
// corpus.lock.json, checked by SHA-256, then only the blackbox folder is extracted with the system unzip.
// Usage: pnpm --filter @web-kit/code-scanner bench:fetch
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("./", import.meta.url));
const lock = JSON.parse(readFileSync(join(here, "corpus.lock.json"), "utf8"));
const out = join(here, ".corpus"), zip = join(out, "corpus.zip"), target = join(out, "blackbox");

if (existsSync(join(target, "qrcode-1"))) {
  console.log(`corpus already in ${target}`);
  process.exit(0);
}
mkdirSync(out, { recursive: true });
console.log(`downloading ${lock.url} (${(lock.bytes / 1e6).toFixed(0)} MB)…`);
const response = await fetch(lock.url);
if (!response.ok) throw new Error(`download failed: ${response.status} ${response.statusText}`);
const bytes = new Uint8Array(await response.arrayBuffer());
const sha256 = createHash("sha256").update(bytes).digest("hex");
if (sha256 !== lock.sha256) {
  throw new Error(
    `SHA-256 of the archive is ${sha256}, corpus.lock.json says ${lock.sha256}. GitHub's archives are not promised to be byte-stable: ` +
      `check that the tag ${lock.ref} still has the same blackbox files (compare a few images against a copy you trust), then update sha256, bytes and checked in corpus.lock.json.`,
  );
}
writeFileSync(zip, bytes);
rmSync(target, { recursive: true, force: true });
execFileSync("unzip", ["-q", "-o", zip, `${lock.root}/${lock.path}/*`, "-d", out], { stdio: "inherit" });
execFileSync("mv", [join(out, lock.root, lock.path), target]);
rmSync(join(out, lock.root), { recursive: true, force: true });
rmSync(zip);
console.log(`corpus extracted to ${target}`);
