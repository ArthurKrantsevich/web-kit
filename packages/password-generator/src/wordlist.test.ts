// @vitest-environment node
/// <reference types="node" />
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { EFF_WORDLIST_SIZE } from "./core/passphrase";
import { EFF_LARGE_WORDLIST } from "./wordlist";

it("has the 7,776 different words of the EFF large wordlist, exactly as EFF publishes the file", () => {
  expect(EFF_LARGE_WORDLIST.length).toBe(EFF_WORDLIST_SIZE);
  expect(new Set(EFF_LARGE_WORDLIST).size).toBe(7776);
  expect([EFF_LARGE_WORDLIST[0], EFF_LARGE_WORDLIST.at(-1)]).toEqual(["abacus", "zoom"]);
  // The published file, rebuilt: five dice from 11111 to 66666, a tab, the word. Its SHA-256 is the one the vendoring
  // script checked on download.
  const file = EFF_LARGE_WORDLIST.map((word, index) => `${index.toString(6).padStart(5, "0").replace(/[0-5]/g, (d) => String(Number(d) + 1))}\t${word}\n`).join("");
  expect(createHash("sha256").update(file).digest("hex")).toBe("addd35536511597a02fa0a9ff1e5284677b8883b83e986e43f15a3db996b903e");
});
