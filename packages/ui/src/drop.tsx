import { useRef, useState, type DragEvent, type ReactElement } from "react";
import { formatLimit, readTextFile } from "./files";

export interface FileReadOptions {
  /** Files larger than this are not read. */
  maxBytes: number;
  /**
   * Called when a file starts being read, before `onText` or `onError`. A tool can note its input here and ignore a
   * text that arrives after the user changed the input.
   */
  onReadStart?: () => void;
  /** The file's text, without a BOM, and the file's name (a tool can show it, or use it in a download's name). */
  onText?: (text: string, file: { name: string }) => void;
  /**
   * The file itself, not read, for a tool that reads it its own way (bytes, in parts, in a worker). The size limit
   * still applies; `onText` is then not called.
   */
  onFile?: (file: File) => void;
  /** A message such as "File is larger than 10 MB". */
  onError: (message: string) => void;
}

export interface UseFileDropOptions extends FileReadOptions {
  /** The file picker's `accept` list, e.g. ".json,application/json,.txt,text/plain"; a dropped file must match it. */
  accept: string;
  /** Accessible name of the hidden file input. Default "Open file". */
  label?: string;
}

export interface FileDropProps {
  onDragEnter: (event: DragEvent) => void;
  onDragOver: (event: DragEvent) => void;
  onDragLeave: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
}

export interface FileDrop {
  /** True while files are dragged over the drop target. */
  isDragging: boolean;
  /** Opens the file picker. */
  open: () => void;
  /** Reads a file as if it was chosen or dropped. Only the file given last is passed on. */
  read: (file: File) => void;
  /** Spread these on the drop target. */
  dropProps: FileDropProps;
  /** The hidden file input that `open()` clicks. Render it once. */
  input: ReactElement;
  /** The `accept` and `maxBytes` it was made with, for messages and tooltips. */
  accept: string;
  maxBytes: number;
}

/**
 * True when the file's name or type matches one entry of an `accept` list (".json", "text/plain", "text/*"). The
 * entry for every type (a star, a slash and a star) takes any file, even one without a type.
 */
export function acceptsFile(file: { name: string; type: string }, accept: string): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .some((entry) =>
      entry === "*/*"
        ? true
        : entry.startsWith(".")
        ? name.endsWith(entry)
        : entry.endsWith("/*")
          ? type.startsWith(entry.slice(0, -1))
          : entry !== "" && type === entry,
    );
}

/** ".json or .txt", ".json, .csv or .txt": the extensions of an `accept` list, for messages. */
export function describeAccept(accept: string): string {
  const extensions = [...new Set(accept.split(",").map((entry) => entry.trim()).filter((entry) => entry.startsWith(".")))];
  if (extensions.length <= 1) return extensions[0] ?? "text";
  return `${extensions.slice(0, -1).join(", ")} or ${extensions.at(-1)}`;
}

const hasFiles = (event: DragEvent): boolean => Array.from(event.dataTransfer?.types ?? []).includes("Files");

/**
 * Opening a file by the picker or by dropping it on an element. Only drags that carry files are handled, so dragging
 * text inside a field works as before. A dropped file must match `accept`; only the first dropped file is read. When a
 * second file is chosen or dropped before the first one is read, only the second one's text or error is passed on.
 */
export function useFileDrop(options: UseFileDropOptions): FileDrop {
  const latest = useRef(options);
  latest.current = options;
  const input = useRef<HTMLInputElement>(null);
  const reads = useRef(0);
  const depth = useRef(0);
  const [isDragging, setDragging] = useState(false);

  function read(file: File): void {
    const id = ++reads.current;
    latest.current.onReadStart?.();
    const { onFile, maxBytes } = latest.current;
    if (onFile) {
      if (file.size > maxBytes) latest.current.onError(`File is larger than ${formatLimit(maxBytes)}`);
      else onFile(file);
      return;
    }
    void readTextFile(file, latest.current.maxBytes).then((result) => {
      // Only the file chosen last counts: an earlier, slower read that finishes after it is dropped.
      if (id !== reads.current) return;
      if (result.ok) latest.current.onText?.(result.value, { name: file.name });
      else latest.current.onError(result.error.message);
    });
  }

  const dropProps: FileDropProps = {
    onDragEnter(event) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current++;
      setDragging(true);
    },
    onDragOver(event) {
      if (!hasFiles(event)) return;
      // Without this the browser opens the file in the tab instead of dropping it here.
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave(event) {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop(event) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      const file = event.dataTransfer.files[0];
      if (!file) return;
      const { accept } = latest.current;
      if (!acceptsFile(file, accept)) {
        latest.current.onError(`Cannot open "${file.name}": choose a ${describeAccept(accept)} file`);
        return;
      }
      read(file);
    },
  };

  const element = (
    <input
      ref={input}
      type="file"
      className="wk-ui-file"
      aria-label={options.label ?? "Open file"}
      tabIndex={-1}
      accept={options.accept}
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) read(file);
        // Let the same file be opened again.
        event.target.value = "";
      }}
    />
  );

  return {
    isDragging,
    open: () => input.current?.click(),
    read,
    dropProps,
    input: element,
    accept: options.accept,
    maxBytes: options.maxBytes,
  };
}
