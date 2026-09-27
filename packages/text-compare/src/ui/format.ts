/** Bytes of `text` in UTF-8, counted without encoding it (a 10 MB text would otherwise be copied on every key). */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      // A surrogate pair is one character of four bytes.
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/** "512 B", "1.5 KB", "5.2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "1 change", "12 changes"; numbers with thousands separators. */
export function count(n: number, word: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? word : `${word}s`}`;
}
