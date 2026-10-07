/**
 * ECI designators → TextDecoder labels (ISO/IEC 18004 Annex, AIM ECI). ECI 0 and 2 are CP437, which TextDecoder does
 * not know: windows-1252 is a deliberate fallback that reads the ASCII half right and the rest approximately.
 */
export const ECI_CHARSETS: Readonly<Record<number, string>> = {
  0: "windows-1252", 1: "iso-8859-1", 2: "windows-1252", 3: "iso-8859-1", 4: "iso-8859-2", 5: "iso-8859-3", 6: "iso-8859-4", 7: "iso-8859-5",
  8: "iso-8859-6", 9: "iso-8859-7", 10: "iso-8859-8", 11: "iso-8859-9", 12: "iso-8859-10", 13: "iso-8859-11", 15: "iso-8859-13", 16: "iso-8859-14",
  17: "iso-8859-15", 18: "iso-8859-16", 20: "shift_jis", 21: "windows-1250", 22: "windows-1251", 23: "windows-1252", 24: "windows-1256",
  25: "utf-16be", 26: "utf-8", 27: "us-ascii", 28: "big5", 29: "gb18030", 30: "euc-kr", 31: "gbk", 32: "gb18030", 33: "utf-16le", 34: "utf-32be", 35: "utf-32le", 170: "us-ascii",
};

/** Bytes as text in a charset; null when the charset is unknown here, or when UTF-8 is asked and the bytes are not valid UTF-8. */
export function decodeBytes(bytes: Uint8Array, label: string): string | null {
  try {
    return new TextDecoder(label === "us-ascii" ? "iso-8859-1" : label, { fatal: label === "utf-8" }).decode(bytes);
  } catch {
    return null;
  }
}

function isShiftJis(bytes: Uint8Array): boolean {
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i]!;
    if (b < 0x80 || (b >= 0xa1 && b <= 0xdf)) { i++; continue; }
    const lead = (b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xef);
    const c = bytes[i + 1];
    if (lead && c !== undefined && c >= 0x40 && c <= 0xfc && c !== 0x7f) { i += 2; continue; }
    return false;
  }
  return true;
}

/** The charset of byte-mode data without ECI: ASCII, whole-sequence UTF-8, Shift JIS pairs, else ISO-8859-1 (spec §4.9). */
export function charsetOf(bytes: Uint8Array): "us-ascii" | "utf-8" | "shift_jis" | "iso-8859-1" {
  if (bytes.every((b) => b < 0x80)) return "us-ascii";
  if (decodeBytes(bytes, "utf-8") !== null) return "utf-8";
  if (isShiftJis(bytes)) return "shift_jis";
  return "iso-8859-1";
}
