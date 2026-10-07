import { afterEach, describe, expect, it, vi } from "vitest";
import { readImageFile, SVG_RASTER_SIZE } from "./image";

/** An `Image` that loads at once with the given intrinsic size, as a browser reports an SVG's width and height. */
function stubImage(naturalWidth: number, naturalHeight: number): void {
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = naturalWidth;
      naturalHeight = naturalHeight;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
}
/** jsdom paints nothing: the 2D context records what is drawn and hands back blank pixels of the asked size. */
function stubCanvas(): { drawn: number[][] } {
  const drawn: number[][] = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    return {
      drawImage: (_: unknown, ...args: number[]) => { drawn.push(args); },
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    } as unknown as CanvasRenderingContext2D;
  });
  return { drawn };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (URL as unknown as Record<string, unknown>).createObjectURL;
  delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
});

describe("readImageFile with an SVG", () => {
  const svg = new File(["<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'/>"], "code.svg", { type: "image/svg+xml" });
  const urls: string[] = [];
  const objectUrls = () => {
    Object.defineProperty(URL, "createObjectURL", { value: () => "blob:svg", configurable: true, writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: (u: string) => { urls.push(u); }, configurable: true, writable: true });
  };

  it("rasterizes one without an intrinsic size at 1024 px square and revokes its URL", async () => {
    objectUrls();
    stubImage(0, 0);
    const { drawn } = stubCanvas();
    const image = await readImageFile(svg);
    expect([image.width, image.height, image.format, image.data.length]).toEqual([SVG_RASTER_SIZE, SVG_RASTER_SIZE, "rgba", SVG_RASTER_SIZE * SVG_RASTER_SIZE * 4]);
    expect(drawn).toEqual([[0, 0, 1024, 1024]]);
    expect(urls).toEqual(["blob:svg"]);
  });

  it("scales a small one up to 1024 px on its long side, keeping its proportions", async () => {
    objectUrls();
    stubImage(200, 100);
    stubCanvas();
    const image = await readImageFile(svg);
    expect([image.width, image.height]).toEqual([1024, 512]);
  });

  it("keeps the own size of one larger than 1024 px", async () => {
    objectUrls();
    stubImage(3000, 1500);
    stubCanvas();
    const image = await readImageFile(svg);
    expect([image.width, image.height]).toEqual([3000, 1500]);
  });

  it("refuses one that would have more than 50 Mpx, naming its size", async () => {
    objectUrls();
    stubImage(8000, 7000);
    stubCanvas();
    await expect(readImageFile(svg)).rejects.toThrow("code.svg has 56.0 Mpx; images up to 50 Mpx can be scanned");
  });
});
