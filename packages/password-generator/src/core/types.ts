/** A result that says why the options were refused instead of throwing: `{ ok: false, error: { message } }`. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: { message: string } };

/** Fills `values` with random 32-bit numbers. The default is `crypto.getRandomValues`; tests pass a known one. */
export type RandomSource = (values: Uint32Array<ArrayBuffer>) => void;

export interface PasswordOptions {
  /** 4 to 128. */
  length: number;
  /** a–z. Default true. */
  lower?: boolean;
  /** A–Z. Default true. */
  upper?: boolean;
  /** 0–9. Default true. */
  digits?: boolean;
  /** The 32 ASCII punctuation characters. Default true. */
  symbols?: boolean;
  /** Leaves out I, l, 1, O, 0 and o. */
  excludeAmbiguous?: boolean;
  /** Characters to leave out. */
  exclude?: string;
  /** At least one character of every chosen set. Default true. */
  requireEach?: boolean;
}

export interface PassphraseOptions {
  /** 3 to 12. */
  words: number;
  /** Between the words; default "-". Up to 16 characters. */
  separator?: string;
  /** Upper-cases the first letter of every word. */
  capitalize?: boolean;
  /** Adds one digit to the end of one word, both chosen at random. */
  includeNumber?: boolean;
}

export interface PinOptions {
  /** 4 to 12 digits. */
  length: number;
}

export interface MemorableOptions {
  /** 2 to 8 groups of syllables. */
  groups: number;
  /** 2 to 4 syllables in each group. */
  syllables: number;
  /** Between the groups; default "-". Up to 16 characters. */
  separator?: string;
  /** Upper-cases the first letter of every group. */
  capitalize?: boolean;
  /** Adds one digit to the end of one group, both chosen at random. */
  includeNumber?: boolean;
}

/** One way of generating, with its options: what `entropy` measures. */
export type GeneratorOptions =
  | ({ mode: "characters" } & PasswordOptions)
  | ({ mode: "words"; listSize?: number } & PassphraseOptions)
  | ({ mode: "memorable" } & MemorableOptions)
  | ({ mode: "pin" } & PinOptions);

export type Strength = "weak" | "fair" | "strong" | "very strong";
