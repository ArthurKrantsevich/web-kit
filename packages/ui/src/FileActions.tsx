import { useEffect, useState, type ReactElement } from "react";
import { ACTIONS, actionTooltip } from "./actions";
import { Button } from "./Button";
import { describeAccept, useFileDrop, type FileDrop, type UseFileDropOptions } from "./drop";
import { formatLimit } from "./files";

interface OpenFileButtonBase {
  /** Visible label. Default "Open file". */
  label?: string;
  /** Accessible name when it says more than the label, e.g. "Open file into Left". */
  "aria-label"?: string;
  /** Default: the Open file template of ACTIONS, filled from `accept`, `maxBytes` and `words`. */
  tooltip?: string;
  /** Words for the tooltip template: `into` (" into Left") and `target` ("the input", the default). */
  words?: Record<string, string>;
  iconOnly?: boolean;
}

/**
 * Either the button reads files itself (`accept`, `maxBytes`, `onText`, `onError`, optional `onReadStart`), or it
 * opens the picker of a `useFileDrop` result that the tool also spreads on a drop target (`drop`); then the tool
 * renders `drop.input`, for example through `EditorPane`'s `drop`, and file picks and drops share one "latest file wins".
 */
export type OpenFileButtonProps = OpenFileButtonBase &
  ({ drop: FileDrop } | (Omit<UseFileDropOptions, "label"> & { drop?: undefined }));

/** Reads nothing: the options of the unused own reader when a `drop` is given. */
const IDLE: UseFileDropOptions = { accept: "", maxBytes: 0, onText: () => {}, onError: () => {} };

/**
 * "Open file": a quiet button that opens the file picker and reads the chosen file with `readTextFile` (UTF-8, BOM
 * removed, size limit). When a second file is chosen before the first is read, only the second one is passed on.
 */
export function OpenFileButton(props: OpenFileButtonProps): ReactElement {
  const { label = ACTIONS.open.label, tooltip, words, iconOnly = false } = props;
  const name = props["aria-label"];
  const own = useFileDrop(props.drop === undefined ? { ...props, label: name ?? label } : IDLE);
  const drop = props.drop ?? own;
  const text =
    tooltip ??
    actionTooltip("open", {
      types: describeAccept(drop.accept),
      limit: formatLimit(drop.maxBytes),
      target: "the input",
      ...words,
    });
  return (
    <>
      <Button icon="open" tooltip={text} iconOnly={iconOnly} aria-label={name} data-action="open" onClick={drop.open}>
        {label}
      </Button>
      {props.drop === undefined && own.input}
    </>
  );
}

export interface PasteButtonProps {
  /** Visible label. Default "Paste". */
  label?: string;
  /** Accessible name when it says more than the label, e.g. "Paste into Left". */
  "aria-label"?: string;
  /** Default: "Paste from the clipboard", plus `words.into` (" into Left"). */
  tooltip?: string;
  words?: Record<string, string>;
  onText: (text: string) => void;
  /** Called with "Clipboard access was denied" when reading fails. */
  onError: (message: string) => void;
  iconOnly?: boolean;
}

/**
 * "Paste": reads the clipboard. Whether the browser can read it is known only after hydration; until then, and in
 * browsers that cannot, the button keeps its place hidden, so nothing next to it moves when it appears.
 */
export function PasteButton({
  label = ACTIONS.paste.label,
  "aria-label": name,
  tooltip,
  words,
  onText,
  onError,
  iconOnly = false,
}: PasteButtonProps): ReactElement {
  // Known only in the browser: deciding it during the server render would not match the first client render.
  const [canPaste, setCanPaste] = useState(false);

  useEffect(() => {
    setCanPaste(typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function");
  }, []);

  if (!canPaste) {
    return (
      <Button
        icon="paste"
        iconOnly={iconOnly}
        className="wk-ui-button--pending"
        aria-label={name}
        aria-hidden="true"
        tabIndex={-1}
        disabled
        data-action="paste"
      >
        {label}
      </Button>
    );
  }

  async function paste(): Promise<void> {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      onError("Clipboard access was denied");
      return;
    }
    onText(text);
  }

  return (
    <Button
      icon="paste"
      tooltip={tooltip ?? actionTooltip("paste", words)}
      iconOnly={iconOnly}
      aria-label={name}
      data-action="paste"
      onClick={() => void paste()}
    >
      {label}
    </Button>
  );
}
