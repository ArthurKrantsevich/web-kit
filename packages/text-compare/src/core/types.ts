/** Which lines count as equal. The text shown and exported is always the original text. */
export interface CompareOptions {
  /** As `git diff -w`: lines are compared without any whitespace, line endings included. */
  ignoreWhitespace?: boolean;
  /** Without regard to case (Unicode toLowerCase). */
  ignoreCase?: boolean;
  /** Empty and whitespace-only lines never make a change. */
  ignoreBlankLines?: boolean;
  /** Default true: CRLF, LF and CR are equal, and so is a last line with or without one. */
  ignoreLineEndings?: boolean;
}

/** The line endings of one side: one kind, several kinds, or none (no line ends with a line break). */
export type LineEndings = "lf" | "crlf" | "cr" | "mixed" | "none";

/** A range of lines, numbered from 0; `end` is not included. */
export interface LineRange {
  start: number;
  end: number;
}

/** Both sides: a changed line. One side: an added (right) or removed (left) line. Line numbers are absolute. */
export interface LinePair {
  left?: number;
  right?: number;
}

export interface DiffBlock {
  kind: "equal" | "change";
  left: LineRange;
  right: LineRange;
  /**
   * For "change": every line of the block in order, similar lines paired. For "equal" only when the sides differ in
   * length, which happens with `ignoreBlankLines`: equal lines paired, the extra blank lines alone.
   */
  pairs?: LinePair[];
}

export interface TextDiff {
  /** Every part of both texts in order, "equal" and "change" alternating. */
  blocks: DiffBlock[];
  /** In lines: a pair is one changed line, a line alone is added or removed. */
  counts: { added: number; removed: number; changed: number };
  /** True when the search was cut short: the diff is correct but may be longer than needed. */
  approximate: boolean;
  lineEndings: { left: LineEndings; right: LineEndings };
  /** True when the side ends with a line break, or is empty. */
  finalNewline: { left: boolean; right: boolean };
}

/** A piece of one line in the inline highlight. */
export type Segment = { text: string; changed: boolean };

export type Granularity = "word" | "char";

export interface UnifiedDiffOptions {
  /** Unchanged lines around each change. Default 3. */
  context?: number;
  /** Default "left". */
  leftName?: string;
  /** Default "right". */
  rightName?: string;
}
