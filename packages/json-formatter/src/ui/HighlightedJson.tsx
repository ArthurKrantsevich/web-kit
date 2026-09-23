import { tokenizeJson, type JsonTokenType } from "@web-kit/json-core";
import { Fragment, useMemo, type CSSProperties, type ReactElement } from "react";

/** Above this many characters the text is shown without highlighting. */
export const HIGHLIGHT_LIMIT = 200_000;

export interface HighlightedJsonProps {
  text: string;
  className?: string;
  "aria-label"?: string;
}

type Piece = { type: JsonTokenType; text: string };

function toLines(text: string): Piece[][] {
  const lines: Piece[][] = [];
  let line: Piece[] = [];
  for (const token of tokenizeJson(text)) {
    const value = text.slice(token.start, token.end);
    if (token.type !== "whitespace") {
      line.push({ type: token.type, text: value });
      continue;
    }
    const parts = value.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) {
        lines.push(line);
        line = [];
      }
      if (part !== "") line.push({ type: "whitespace", text: part });
    });
  }
  lines.push(line);
  return lines;
}

/** Syntax-highlighted JSON with CSS line numbers. The copied text has no line numbers. */
export function HighlightedJson(props: HighlightedJsonProps): ReactElement {
  const { text } = props;
  const lines = useMemo(() => (text.length > HIGHLIGHT_LIMIT ? null : toLines(text)), [text]);
  return (
    <pre
      className={["wk-code", props.className].filter(Boolean).join(" ")}
      aria-label={props["aria-label"]}
      tabIndex={0}
      style={lines === null ? undefined : ({ "--wk-gutter": `${Math.max(3, String(lines.length).length)}ch` } as CSSProperties)}
    >
      {lines === null
        ? text
        : lines.map((line, index) => (
            <Fragment key={index}>
              <span className="wk-code__line">
                {line.map((piece, at) =>
                  piece.type === "whitespace" ? (
                    piece.text
                  ) : (
                    <span key={at} className={`wk-syntax-${piece.type}`}>
                      {piece.text}
                    </span>
                  ),
                )}
              </span>
              {index < lines.length - 1 ? "\n" : null}
            </Fragment>
          ))}
    </pre>
  );
}
