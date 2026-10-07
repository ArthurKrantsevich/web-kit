import { BINARIZERS, type Binarization } from "./binarize";
import { applyLut, contrastLut, crop, downsample2, flattenLighting, quarterSpread, toGray, upscale2, type GrayPlane } from "./image";
import type { BinarizerId, Pass, Point, ScanImage, ScanOptions } from "./types";

/** The binarization cascade (spec §4.3); the `hard` passes run only with tryHarder. */
export const CASCADE: readonly (Pass & { hard: boolean })[] = [
  { id: "hybrid", inverted: false, flat: false, hard: false },
  { id: "sauvola", inverted: false, flat: false, hard: false },
  { id: "otsu", inverted: false, flat: false, hard: false },
  { id: "hybrid", inverted: true, flat: false, hard: false },
  { id: "sauvola", inverted: true, flat: false, hard: false },
  { id: "otsu", inverted: true, flat: false, hard: false },
  { id: "wolf", inverted: false, flat: false, hard: true },
  { id: "wolf", inverted: true, flat: false, hard: true },
  { id: "edge", inverted: false, flat: false, hard: true },
];

export interface Level {
  gray: GrayPlane;
  /** Pixels of the input per pixel of this level: 1, 2, 4, … */
  scale: number;
}

export interface LevelBinarization extends Binarization {
  /** The plane that was binarized (normalized, flattened and inverted as the pass says). */
  gray: GrayPlane;
  level: number;
  scale: number;
}

/**
 * Everything the decoders share while one image is scanned: the pyramid, binarizations cached per level and pass,
 * the deadline, the current pass and a log of attempts for tests.
 */
export class ScanContext {
  readonly options: ScanOptions;
  readonly tryHarder: boolean;
  readonly deadline: number;
  readonly levels: Level[] = [];
  readonly startLevel: number;
  /** The ROI's top-left in the input image: results are shifted back by it. */
  readonly offset: Point;
  pass: Pass = { id: "hybrid", inverted: false, flat: false };
  log: unknown[] = [];
  private readonly normalized = new Map<number, GrayPlane>();
  private readonly flattened = new Map<number, GrayPlane>();
  private readonly cache = new Map<string, LevelBinarization>();
  private lut: Uint8Array | null | undefined;
  private up: GrayPlane | null = null;

  constructor(image: ScanImage, options: ScanOptions) {
    this.options = options;
    this.tryHarder = options.tryHarder === true;
    this.deadline = performance.now() + (options.deadlineMs ?? (this.tryHarder ? 500 : 40));
    let gray = toGray(image);
    this.offset = [0, 0];
    if (options.roi) {
      gray = crop(gray, options.roi);
      this.offset = [Math.max(0, Math.floor(options.roi.x)), Math.max(0, Math.floor(options.roi.y))];
    }
    let scale = 1;
    for (;;) {
      this.levels.push({ gray, scale });
      if (Math.max(gray.width, gray.height) < 320) break;
      gray = downsample2(gray);
      scale *= 2;
    }
    const start = this.levels.findIndex((level) => Math.max(level.gray.width, level.gray.height) <= 1280);
    this.startLevel = start < 0 ? this.levels.length - 1 : start;
  }

  expired(): boolean {
    return performance.now() > this.deadline;
  }

  /** A level's gray plane with the contrast stretch (one LUT from the start level), or lighting-corrected (`flat`). */
  plane(level: number, flat: boolean): GrayPlane {
    const L = this.levels[level]!;
    if (flat) {
      let p = this.flattened.get(level);
      if (!p) { p = flattenLighting(L.gray); this.flattened.set(level, p); }
      return p;
    }
    let p = this.normalized.get(level);
    if (!p) {
      if (this.lut === undefined) this.lut = contrastLut(this.levels[this.startLevel]!.gray);
      p = this.lut === null ? L.gray : applyLut(L.gray, this.lut);
      this.normalized.set(level, p);
    }
    return p;
  }

  /** The ×2 upscaled original (level −1), for modules under 2.5 px with tryHarder. */
  upscaled(): GrayPlane {
    return (this.up ??= upscale2(this.plane(0, false)));
  }

  /**
   * A binarization of a level (−1 = the upscaled original) for a binarizer and polarity, cached. `lazy` (the default
   * off the start level) compares on demand instead of making a bits array. The module hint is part of the key only
   * for Sauvola and Wolf, whose window depends on it; the others are built once per level. Level −1 is never
   * lighting-corrected, so a `flat` request there shares the plain entry.
   */
  binarize(level: number, id: BinarizerId, inverted: boolean, flat: boolean, moduleHint: number = 5, lazy: boolean = level !== this.startLevel): LevelBinarization {
    const key = this.keyOf(level, id, inverted, flat, moduleHint, lazy);
    let b = this.cache.get(key);
    if (!b) {
      let gray = level === -1 ? this.upscaled() : this.plane(level, flat);
      if (inverted) {
        const d = new Uint8Array(gray.data.length);
        for (let i = 0; i < d.length; i++) d[i] = 255 - gray.data[i]!;
        gray = { width: gray.width, height: gray.height, data: d };
      }
      b = { ...BINARIZERS[id](gray, moduleHint, lazy), gray, level, scale: level === -1 ? 0.5 : this.levels[level]!.scale };
      this.cache.set(key, b);
    }
    return b;
  }

  /** Whether `binarize` with these arguments would return a cached entry, so a caller near the deadline can tell a lookup from a computation. */
  cached(level: number, id: BinarizerId, inverted: boolean, flat: boolean, moduleHint: number = 5, lazy: boolean = level !== this.startLevel): boolean {
    return this.cache.has(this.keyOf(level, id, inverted, flat, moduleHint, lazy));
  }

  private keyOf(level: number, id: BinarizerId, inverted: boolean, flat: boolean, moduleHint: number, lazy: boolean): string {
    const hint = id === "sauvola" || id === "wolf" ? Math.round(moduleHint) : 0;
    return `${level}:${id}:${inverted}:${level !== -1 && flat}:${lazy}:${hint}`;
  }

  /** Quarter means more than 25 % of the range apart on the start level. */
  unevenLighting(): boolean {
    return quarterSpread(this.levels[this.startLevel]!.gray) > 0.25;
  }
}
