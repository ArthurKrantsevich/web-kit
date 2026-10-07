import type { ScanContext } from "./context";

/** The input: luminance (1 byte per pixel) or RGBA (4 bytes), row by row, without padding. */
export interface ScanImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
  format: "gray" | "rgba";
}

export type Symbology =
  | "qr" | "micro-qr" | "rmqr" | "data-matrix" | "aztec" | "pdf417" | "micropdf417" | "maxicode"
  | "ean-13" | "ean-8" | "upc-a" | "upc-e" | "code-128" | "code-39" | "code-93" | "codabar" | "itf"
  | "databar" | "databar-limited" | "databar-expanded" | "msi" | "code-11";

/** x, y in pixels of the input image. */
export type Point = [number, number];

/** One segment of the data stream: its mode, its bytes and the ECI in force when it was read. */
export interface Segment {
  mode: string;
  bytes: Uint8Array;
  eci: number | null;
}

export interface StructuredAppend {
  index: number;
  total: number;
  parity: number;
}

export interface EccInfo {
  level: string | null;
  /** Error-correction codewords in the symbol. */
  capacity: number;
  corrected: number;
  erasures: number;
}

export interface SymbolInfo {
  rows: number;
  cols: number;
  version?: number | string;
}

export interface ScanResult {
  symbology: Symbology;
  text: string;
  bytes: Uint8Array;
  segments: Segment[];
  eci: number | null;
  charset: string;
  /** FNC1 in the first position. */
  gs1: boolean;
  structuredAppend: StructuredAppend | null;
  /**
   * The symbol's corners in input-image coordinates, in the symbol's own frame: top-left, top-right, bottom-right,
   * bottom-left as the symbol is meant to be read. Clockwise in the image for an upright symbol; a mirrored symbol's
   * points run counter-clockwise in the image.
   */
  points: [Point, Point, Point, Point];
  /** Degrees 0–359 (y down, so a quarter turn clockwise is 90): the angle of the image vector from the symbol's top-left to its top-right. */
  orientation: number;
  mirrored: boolean;
  inverted: boolean;
  symbol: SymbolInfo;
  ecc: EccInfo;
  /** 0–1: the share of confident modules times 1 − corrected / capacity. */
  confidence: number;
  addOn?: string;
}

export interface Roi {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BinarizerId = "hybrid" | "sauvola" | "otsu" | "wolf" | "edge";

/** One step of the binarization cascade: which binarizer, which polarity, with or without lighting correction. */
export interface Pass {
  id: BinarizerId;
  inverted: boolean;
  flat: boolean;
}

/** What a decoder's `locate` found: a pyramid level, a module size there, rough corners, and its own details. */
export interface Candidate {
  level: number;
  module: number;
  corners: Point[];
  detail: unknown;
}

export interface SymbologyDecoder {
  id: Symbology | "qr-family" | "oned";
  family: "2d" | "1d";
  /** Candidates on the current pass of the context. */
  locate(ctx: ScanContext): Candidate[];
  /** The full decode of a candidate, or null when it is not a code. */
  decode(ctx: ScanContext, candidate: Candidate): ScanResult | null;
}

/** Adds candidates before the decoders' own search (a future detector, spec §12). */
export interface Locator {
  id: string;
  locate(ctx: ScanContext): Candidate[];
}

export interface ScanOptions {
  /** What to look for; the order is the priority. An empty list finds nothing. */
  decoders: SymbologyDecoder[];
  /** The whole cascade, the upscaled level and more hypotheses. Default false. */
  tryHarder?: boolean;
  /** Every code in the frame. Default false: the first one found. */
  multiple?: boolean;
  /** Region of interest in pixels. Default: the whole frame. */
  roi?: Roi;
  /** Deadline in milliseconds; default 40 without tryHarder and 500 with it. */
  deadlineMs?: number;
  locators?: Locator[];
}
