# @web-kit/text-compare

Compare two texts or files: side by side or in one column, changes highlighted by line, word or character, whitespace, case, blank lines and line endings ignored when you ask, changes copied from one side to the other, and the result exported as a unified diff that `git apply` and `patch` accept.

> Not published to npm yet. The package name will change before the first release.

## Logic only (no React)

```ts
import { applyBlock, compareTexts, inlineDiff, toUnifiedDiff } from "@web-kit/text-compare/core";

const diff = compareTexts("a\nold line\nc\n", "a\nnew line\nc\nd\n", { ignoreWhitespace: true });
diff.counts; // { added: 1, removed: 0, changed: 1 }
diff.blocks; // equal and change blocks: { kind, left: { start, end }, right: { start, end }, pairs }

toUnifiedDiff("a\nold line\nc\n", "a\nnew line\nc\nd\n", diff, { leftName: "old.txt", rightName: "new.txt" });
// "--- old.txt\n+++ new.txt\n@@ -1,3 +1,4 @@\n a\n-old line\n+new line\n c\n+d\n"

inlineDiff("old line", "new line", "word"); // { left: [{ text: "old", changed: true }, { text: " line", changed: false }], right: … }
applyBlock("a\nold line\nc\n", "a\nnew line\nc\nd\n", diff, 1, "to-left"); // "a\nnew line\nc\n"
```

- Lines are split at LF, CRLF and CR; each line keeps its ending, and each side reports its line endings (`lf`, `crlf`, `cr`, `mixed`, `none`) and whether it ends with a line break. A BOM is removed.
- `ignoreWhitespace` works like `git diff -w`, `ignoreCase` compares lowercased text, `ignoreBlankLines` keeps empty and whitespace-only lines out of changes, and `ignoreLineEndings` (on by default) makes CRLF, LF, CR and a missing last line break equal. They only decide which lines are equal: the text shown and exported is the original one.
- The diff is Myers' O(ND) algorithm in linear space, with common ends cut off and lines that the other side does not have set aside first, as git does. Changes that can move are placed as git places them (its indent heuristic), so a patch reads like `git diff`'s; the tests compare `toUnifiedDiff` with recorded `git diff --no-index -U3` output. When the texts differ too much for an exact search in reasonable time, the search stops early, the diff is still correct but may be longer than needed, and `approximate` is true.
- Inside a change block similar lines are paired (at least half of their characters match, by LCS; lines over 10,000 characters are not compared). A pair counts as one changed line, a line alone as added or removed.
- `inlineDiff` splits words (runs of letters and digits), whitespace and other characters, or characters by grapheme, so an emoji or an accented letter is never cut. What the options ignore is never marked.
- `toUnifiedDiff` writes `\ No newline at end of file` where needed and keeps CRLF endings. A file name with a space ends its header line with a tab, as in `git diff`; control characters are removed from names. Context lines come from the left text, so the patch always applies to Left. With nothing ignored, applying it gives Right exactly. With ignore options on, it gives Right apart from the ignored differences: an unchanged line keeps Left's spacing, case or line ending. The tests check this for all 16 combinations of options.
- The recorded `git diff` examples match byte for byte, except the `-w` ones. There git prints context lines from the right file, and `toUnifiedDiff` prints them from the left one. Only one recorded example differs in this way ("whitespace and a real change, with -w"), and the fixture keeps git's own output beside the expected patch.
- `applyBlock` returns the new text of one side after copying a change from the other; copied lines take that side's usual line ending (with `ignoreLineEndings: false`, their own).

## React component

```tsx
import { TextCompare } from "@web-kit/text-compare";
import "@web-kit/text-compare/styles.css";

export function Page() {
  return <TextCompare initialLeft={oldText} initialRight={newText} />;
}
```

The component is built with `@web-kit/ui`. The toolbar has the layout (Side by side or Inline), the highlight (Words or Characters), the Ignore menu (Whitespace, Case, Blank lines, Line endings; the button counts the ticked ones), Swap, Sample, Clear and More actions (load either side from a URL, show all unchanged lines, share link, saved input, keyboard shortcuts). Each side's header has Open file and Paste; a file can be dropped on a side, up to 10 MB, and its name then titles that side and the patch. The result under the inputs is as tall as they are and scrolls on its own, so both sides scroll together; its header has the counts, Previous and Next change, Download (`compare.patch`) and Copy.

- Unchanged runs longer than eight lines are folded to three lines of context; "Show N unchanged lines" opens one, More actions → "Show all unchanged lines" all of them. At most 5,000 rows are drawn at once, with "Show more".
- Each change has "Use left" (→) and "Use right" (←), shown on hover and keyboard focus and always on touch screens. They edit the input, so Ctrl+Z in that input undoes them (a side whose text has CR line breaks, from a file, is replaced as a whole: a text field keeps only LF). The result keeps its scroll.
- Previous and Next frame the current change and bring it to the middle of the result; so do Alt+↓/Alt+↑ and F7/Shift+F7. Ctrl/⌘+Enter swaps the sides; `?` lists the keys.
- Texts over 1 MB together are compared in a Web Worker (`@web-kit/text-compare/worker`, started by the component itself): the result says "Comparing 5.2 MB…" and the page stays responsive; a new edit cancels the running comparison. Where no worker can start, the comparison runs on the page with a note.
- The status line names what matters about the result: approximate, different line endings, a missing line break at the end.

`useTextCompare()` gives the same state without markup. Set `--wk-compare-height` to change the height of the inputs and of the result.

## License

MIT
