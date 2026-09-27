import { useEffect, useRef, useState, type ReactElement } from "react";
import { Button } from "./Button";
import { readTextFile } from "./files";

export interface OpenFileButtonProps {
  /** Accessible name of the button and of the hidden file input. Default "Open file". */
  label?: string;
  tooltip: string;
  /** The `accept` attribute of the file input. */
  accept: string;
  maxBytes: number;
  /**
   * Called when a chosen file starts being read, before `onText` or `onError`. A tool can note its input here and
   * ignore a text that arrives after the user changed the input.
   */
  onReadStart?: () => void;
  /** The file's text, without a BOM. */
  onText: (text: string) => void;
  /** A message such as "File is larger than 10 MB". */
  onError: (message: string) => void;
  iconOnly?: boolean;
}

/**
 * "Open file": a quiet button that opens the file picker and reads the chosen file with `readTextFile`. When a second
 * file is chosen before the first is read, only the second one's text or error is passed on.
 */
export function OpenFileButton({
  label = "Open file",
  tooltip,
  accept,
  maxBytes,
  onReadStart,
  onText,
  onError,
  iconOnly = false,
}: OpenFileButtonProps): ReactElement {
  const input = useRef<HTMLInputElement>(null);
  // Only the file chosen last counts: an earlier, slower read that finishes after it is dropped.
  const latestRead = useRef(0);

  async function open(file: File | undefined): Promise<void> {
    if (!file) return;
    const id = ++latestRead.current;
    onReadStart?.();
    const read = await readTextFile(file, maxBytes);
    if (id !== latestRead.current) return;
    if (read.ok) onText(read.value);
    else onError(read.error.message);
  }

  return (
    <>
      <Button icon="open" tooltip={tooltip} iconOnly={iconOnly} onClick={() => input.current?.click()}>
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        className="wk-ui-file"
        aria-label={label}
        tabIndex={-1}
        accept={accept}
        onChange={(event) => {
          void open(event.target.files?.[0]);
          // Let the same file be opened again.
          event.target.value = "";
        }}
      />
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
