import type { ToolMeta } from "../../registry";

export const meta: ToolMeta = {
  id: "text-compare",
  title: "Text Compare",
  description: "Compare two texts or files side by side, by line, word or character, and export a patch.",
  preview: `  port = 8080
- theme = light
+ theme = dark
+ language = en`,
  category: "data",
  tags: ["text", "diff", "compare", "merge", "patch", "unified diff"],
  pkg: "@web-kit/text-compare",
  usage: `import { TextCompare } from "@web-kit/text-compare";
import "@web-kit/text-compare/styles.css";

export function Page() {
  return <TextCompare />;
}

// Logic only, no React:
import { compareTexts, toUnifiedDiff } from "@web-kit/text-compare/core";

const diff = compareTexts(oldText, newText, { ignoreWhitespace: true });
console.log(diff.counts, toUnifiedDiff(oldText, newText, diff));`,
  api: [
    {
      name: "compareTexts",
      signature: "compareTexts(left, right, { ignoreWhitespace?, ignoreCase?, ignoreBlankLines?, ignoreLineEndings? }): TextDiff",
      description:
        "Equal and change blocks with similar lines paired, line counts, line endings and final newlines of both sides. Myers' diff with git's cost limit: always correct, marked approximate when not minimal.",
    },
    {
      name: "inlineDiff",
      signature: 'inlineDiff(left, right, "word" | "char", options?): { left: Segment[]; right: Segment[] }',
      description: "The changed words or characters of two lines; emoji and accents stay whole, ignored differences are not marked.",
    },
    {
      name: "toUnifiedDiff",
      signature: "toUnifiedDiff(left, right, diff, { context?, leftName?, rightName? }): string",
      description: "A unified diff that git apply and patch accept, as git diff -U3 prints it, with \\ No newline at end of file.",
    },
    {
      name: "applyBlock",
      signature: 'applyBlock(left, right, diff, index, "to-left" | "to-right", options?): string',
      description: "The new text of one side after copying a change block from the other, in that side's line endings.",
    },
    {
      name: "TextCompare",
      signature: "<TextCompare initialLeft? initialRight? className? />",
      description:
        "Ready-made UI: two inputs with Open file, Paste, a dropped file or a URL; side by side or inline, word or character highlight, ignore options, folded unchanged lines, next and previous change, merge buttons, Copy and Download of the patch, share link, saved input, shortcuts and a worker for texts over 1 MB.",
    },
    {
      name: "useTextCompare",
      signature: "useTextCompare({ initialLeft?, initialRight? }): UseTextCompare",
      description: "Headless state: both texts and file names, layout, highlight, options and the comparison.",
    },
  ],
};
