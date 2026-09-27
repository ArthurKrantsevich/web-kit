import { Fragment, useDeferredValue, useMemo, type ReactElement } from "react";
import type { CsvDelimiter } from "../core/csv";
import type { ConvertTarget } from "./convert";
import { HIGHLIGHT_LIMIT, toLines, tokenizeOutput } from "./highlight";

export interface HighlightedOutputProps {
  text: string;
  target: ConvertTarget;
  delimiter: CsvDelimiter;
}

/** The converted text with `wk-syntax-*` colors for its format; plain above 200,000 characters. */
export function HighlightedOutput({ text, target, delimiter }: HighlightedOutputProps): ReactElement {
  // Highlighting a large output is slower than typing; let it lag behind the input.
  const shown = useDeferredValue({ text, target, delimiter });
  const lines = useMemo(
    () => (shown.text.length > HIGHLIGHT_LIMIT ? null : toLines(tokenizeOutput(shown.text, shown.target, shown.delimiter))),
    [shown],
  );
  return (
    <pre className="wk-ui-area wk-convert__output" aria-label="Output" tabIndex={0}>
      {lines === null
        ? shown.text
        : lines.map((line, index) => (
            <Fragment key={index}>
              {line.map((token, at) =>
                token.type === null ? (
                  token.text
                ) : (
                  <span key={at} className={`wk-syntax-${token.type}`}>
                    {token.text}
                  </span>
                ),
              )}
              {index < lines.length - 1 ? "\n" : null}
            </Fragment>
          ))}
    </pre>
  );
}
