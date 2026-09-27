import { dominantEnding, splitLines } from "./lines";
import type { CompareOptions, TextDiff } from "./types";

/**
 * Copies one change block to the other side: "to-right" replaces the block's lines in `right` with those of `left`,
 * "to-left" the reverse. Returns the new text of that side; anything else about it (the other blocks, a BOM) stays.
 * Copied lines take the line ending most lines of that side use, unless `options.ignoreLineEndings` is false: then
 * the endings are part of the text and are copied as written. `diff` must be `compareTexts(left, right, options)`.
 * A block that is not a change leaves the text as it is.
 */
export function applyBlock(
  left: string,
  right: string,
  diff: TextDiff,
  index: number,
  direction: "to-left" | "to-right",
  options: CompareOptions = {},
): string {
  const block = diff.blocks[index];
  const [sourceText, targetText] = direction === "to-left" ? [right, left] : [left, right];
  if (block?.kind !== "change") return targetText;
  const [from, to] = direction === "to-left" ? [block.right, block.left] : [block.left, block.right];
  const source = splitLines(sourceText);
  const target = splitLines(targetText);
  const keep = options.ignoreLineEndings === false;
  const ending = dominantEnding(target) ?? dominantEnding(source) ?? "\n";

  const lines = target.lines.slice(0, to.start);
  const endings = target.endings.slice(0, to.start);
  // A last line without a line break gets one when lines now follow it.
  if (endings.length > 0 && endings.at(-1) === "" && (from.end > from.start || to.end < target.lines.length)) {
    endings[endings.length - 1] = ending;
  }
  for (let i = from.start; i < from.end; i++) {
    lines.push(source.lines[i]!);
    // The source's last line keeps having no line break, so that the two sides end alike.
    endings.push(keep || source.endings[i] === "" ? source.endings[i]! : ending);
  }
  if (to.end < target.lines.length && endings.at(-1) === "") endings[endings.length - 1] = ending;
  lines.push(...target.lines.slice(to.end));
  endings.push(...target.endings.slice(to.end));

  // A lone CR followed by an empty line that ends with LF would read back as one CRLF: where a copied line meets
  // another one that way, the copied line's ending changes so that both lines stay.
  const copiedEnd = to.start + (from.end - from.start);
  for (let k = Math.max(0, to.start - 1); k < Math.min(copiedEnd, lines.length - 1); k++) {
    if (endings[k] !== "\r" || lines[k + 1] !== "" || !endings[k + 1]!.startsWith("\n")) continue;
    if (k + 1 < copiedEnd) endings[k + 1] = "\r";
    else endings[k] = "\r\n";
  }

  let text = target.bom ? "\uFEFF" : "";
  for (let i = 0; i < lines.length; i++) text += lines[i]! + endings[i]!;
  return text;
}
