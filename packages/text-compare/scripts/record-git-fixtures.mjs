// Records what `git diff --no-index -U3` prints for a set of example pairs into src/core/git-fixtures.ts, which
// git.test.ts compares toUnifiedDiff with. Run it from packages/text-compare after changing the examples:
//   node scripts/record-git-fixtures.mjs
// CI needs no git: it only reads the recorded file. The `diff --git` and `index` lines are dropped (they name temporary
// files), and so is the function name git adds after a hunk header, which toUnifiedDiff does not write.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const lines = (...list) => list.map((line) => `${line}\n`).join("");
const numbered = (count, change = {}) => lines(...Array.from({ length: count }, (_, i) => change[i + 1] ?? `line ${i + 1}`));

/** [name, left, right, git flags]. Options for compareTexts follow from the flags (see git.test.ts). */
const CASES = [
  ["one changed line", lines("alpha", "beta", "gamma"), lines("alpha", "BETA", "gamma"), []],
  ["added at the start", lines("b", "c", "d", "e"), lines("a", "b", "c", "d", "e"), []],
  ["added at the end", lines("a", "b", "c"), lines("a", "b", "c", "d", "e"), []],
  ["removed at the start", lines("a", "b", "c", "d", "e"), lines("c", "d", "e"), []],
  ["everything removed", lines("a", "b"), "", []],
  ["from nothing", "", lines("a", "b"), []],
  ["two distant changes make two hunks", numbered(30), numbered(30, { 3: "changed 3", 25: "changed 25" }), []],
  ["close changes share a hunk", numbered(20), numbered(20, { 5: "changed 5", 11: "changed 11" }), []],
  ["changes seven lines apart share a hunk", numbered(20), numbered(20, { 5: "changed 5", 12: "changed 12" }), []],
  ["changes eight lines apart make two hunks", numbered(20), numbered(20, { 5: "changed 5", 13: "changed 13" }), []],
  ["no newline at the end of the right side", lines("a", "b"), "a\nb", []],
  ["no newline at the end of the left side", "a\nb", lines("a", "b"), []],
  ["no newline on either side, last line changed", "a\nb", "a\nc", []],
  ["no newline on either side, first line changed", "a\nb\nc\nd\ne", "x\nb\nc\nd\ne", []],
  ["CRLF lines", "one\r\ntwo\r\nthree\r\n", "one\r\n2\r\nthree\r\n", []],
  ["CRLF against LF", "one\r\ntwo\r\n", lines("one", "two"), []],
  ["unicode", lines("Привет, мир", "emoji 👍🏽", "日本語"), lines("Привет, мир!", "emoji 👍🏽", "中文"), []],
  [
    "a function inserted between two",
    lines("int f() {", "  return 1;", "}", "", "int h() {", "  return 3;", "}"),
    lines("int f() {", "  return 1;", "}", "", "int g() {", "  return 2;", "}", "", "int h() {", "  return 3;", "}"),
    [],
  ],
  [
    "a python method inserted",
    lines("class A:", "    def a(self):", "        return 1", "", "    def c(self):", "        return 3"),
    lines("class A:", "    def a(self):", "        return 1", "", "    def b(self):", "        return 2", "", "    def c(self):", "        return 3"),
    [],
  ],
  [
    "a paragraph inserted between paragraphs",
    lines("First paragraph.", "", "Third paragraph.", "", "Fourth."),
    lines("First paragraph.", "", "Second paragraph,", "on two lines.", "", "Third paragraph.", "", "Fourth."),
    [],
  ],
  [
    "a nested block removed",
    lines("if (a) {", "  if (b) {", "    run();", "  }", "  if (c) {", "    stop();", "  }", "}"),
    lines("if (a) {", "  if (c) {", "    stop();", "  }", "}"),
    [],
  ],
  [
    "a JSON item added",
    lines("[", "  {", '    "id": 1', "  },", "  {", '    "id": 2', "  }", "]"),
    lines("[", "  {", '    "id": 1', "  },", "  {", '    "id": 2', "  },", "  {", '    "id": 3', "  }", "]"),
    [],
  ],
  [
    "lines moved",
    lines("import a", "import b", "", "const x = 1;", "const y = 2;", "", "run(x, y);"),
    lines("import b", "import a", "", "const y = 2;", "const x = 1;", "", "run(x, y);"),
    [],
  ],
  [
    "a config edited in three places",
    lines("[server]", "host = localhost", "port = 8080", "", "[db]", "name = app", "user = admin", "pool = 5", "", "[log]", "level = info", "file = app.log"),
    lines("[server]", "host = 0.0.0.0", "port = 8080", "", "[db]", "name = app", "user = app", "pool = 10", "timeout = 30", "", "[log]", "level = debug", "file = app.log"),
    [],
  ],
  ["only whitespace differs, with -w", lines("a  b", "c", "\td"), lines("a b", "c", "    d"), ["-w"]],
  ["whitespace and a real change, with -w", lines("if (x)  {", "  y = 1;", "}"), lines("if (x) {", "    y = 2;", "}"), ["-w"]],
];

const dir = mkdtempSync(join(tmpdir(), "text-compare-"));
const fixtures = [];
try {
  for (const [name, left, right, flags] of CASES) {
    writeFileSync(join(dir, "left"), left);
    writeFileSync(join(dir, "right"), right);
    let out;
    try {
      out = execFileSync("git", ["diff", "--no-index", "--no-prefix", "--no-color", "-U3", ...flags, "left", "right"], {
        cwd: dir,
        encoding: "utf8",
      });
    } catch (error) {
      // git diff exits with 1 when the files differ.
      if (error.status !== 1) throw error;
      out = error.stdout;
    }
    const start = out.indexOf("--- left\n");
    const patch = start < 0 ? "" : out.slice(start).replace(/^(@@ -\S+ \+\S+ @@).*$/gm, "$1");
    fixtures.push({ name, left, right, ignoreWhitespace: flags.includes("-w"), patch });
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const version = execFileSync("git", ["--version"], { encoding: "utf8" }).trim();
writeFileSync(
  new URL("../src/core/git-fixtures.ts", import.meta.url),
  `// Generated by scripts/record-git-fixtures.mjs with ${version}. Do not edit by hand.

export interface GitFixture {
  name: string;
  left: string;
  right: string;
  /** Recorded with git diff -w. */
  ignoreWhitespace: boolean;
  /** git's output from the --- line on, without the function names after hunk headers. */
  patch: string;
}

export const GIT_FIXTURES: GitFixture[] = ${JSON.stringify(fixtures, null, 2)};
`,
);
console.log(`recorded ${fixtures.length} fixtures with ${version}`);
