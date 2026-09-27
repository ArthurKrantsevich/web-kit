import { useEffect, useState, type ReactElement } from "react";
import { Button } from "./Button";
import { useFileDrop, type FileDrop, type UseFileDropOptions } from "./drop";

interface OpenFileButtonBase {
  /** Accessible name of the button and of the hidden file input. Default "Open file". */
  label?: string;
  tooltip: string;
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
  const { label = "Open file", tooltip, iconOnly = false } = props;
  const own = useFileDrop(props.drop === undefined ? { ...props, label } : IDLE);
  const drop = props.drop ?? own;
  return (
    <>
      <Button icon="open" tooltip={tooltip} iconOnly={iconOnly} onClick={drop.open}>
        {label}
      </Button>
      {props.drop === undefined && own.input}
    </>
  );
}

export interface PasteButtonProps {
  /** Default "Paste". */
  label?: string;
  tooltip: string;
  onText: (text: string) => void;
  /** Called with "Clipboard access was denied" when reading fails. */
  onError: (message: string) => void;
  iconOnly?: boolean;
}

/** "Paste": reads the clipboard. Rendered only in browsers that can read it, decided after hydration. */
export function PasteButton({ label = "Paste", tooltip, onText, onError, iconOnly = false }: PasteButtonProps): ReactElement | null {
  // Known only in the browser: deciding it during the server render would not match the first client render.
  const [canPaste, setCanPaste] = useState(false);

  useEffect(() => {
    setCanPaste(typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function");
  }, []);

  if (!canPaste) return null;

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
    <Button icon="paste" tooltip={tooltip} iconOnly={iconOnly} onClick={() => void paste()}>
      {label}
    </Button>
  );
}
