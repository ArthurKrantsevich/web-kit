import type { ScanImage } from "../core/types";

/** Files larger than this are refused. */
export const MAX_IMAGE_BYTES: number = 25 * 1024 * 1024;
/** Images with more pixels than this are refused. */
export const MAX_IMAGE_PIXELS: number = 50_000_000;
/** The file picker's and drop's accept list. */
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg";
/** The long side an SVG is rasterized at, unless its own width or height is larger. */
export const SVG_RASTER_SIZE = 1024;

export class ImageReadError extends Error {
  readonly reason: "type" | "size" | "pixels" | "decode";
  constructor(reason: "type" | "size" | "pixels" | "decode", message: string) {
    super(message);
    this.name = "ImageReadError";
    this.reason = reason;
  }
}

const isSvg = (file: File): boolean => file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
const isImage = (file: File): boolean => isSvg(file) || /^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);

function pixelsOf(width: number, height: number): string {
  return `${(width * height / 1e6).toFixed(1)} Mpx`;
}

/** Draws a bitmap or an image element at a size and returns its RGBA pixels. */
function pixelsFrom(source: ImageBitmap | HTMLImageElement, width: number, height: number): ScanImage {
  const canvas: OffscreenCanvas | HTMLCanvasElement = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(width, height) : Object.assign(document.createElement("canvas"), { width, height });
  const context = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!context) throw new ImageReadError("decode", "The image could not be drawn");
  context.drawImage(source, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  return { width, height, data, format: "rgba" };
}

/**
 * The pixels of an image file: PNG, JPEG, WebP, GIF (its first frame), BMP through `createImageBitmap` with the EXIF
 * orientation applied; SVG through an `<img>` at 1024 px on the long side, or its own size when larger. Refuses other
 * types, files over 25 MB and images over 50 Mpx, each with the limit in the message.
 */
export async function readImageFile(file: File): Promise<ScanImage> {
  if (!isImage(file)) throw new ImageReadError("type", `${file.name} is not an image: open a PNG, JPEG, WebP, GIF, BMP or SVG`);
  if (file.size > MAX_IMAGE_BYTES) throw new ImageReadError("size", `File is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);
  if (isSvg(file)) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new ImageReadError("decode", `${file.name} could not be read as an image`));
        element.src = url;
      });
      // An SVG without an intrinsic size (a viewBox only: Firefox reports 0 × 0) is taken as 1024 px square.
      const nw = img.naturalWidth || SVG_RASTER_SIZE, nh = img.naturalHeight || SVG_RASTER_SIZE;
      const scale = Math.max(SVG_RASTER_SIZE, nw, nh) / Math.max(nw, nh);
      const width = Math.max(1, Math.round(nw * scale)), height = Math.max(1, Math.round(nh * scale));
      if (width * height > MAX_IMAGE_PIXELS) throw new ImageReadError("pixels", `${file.name} has ${pixelsOf(width, height)}; images up to ${MAX_IMAGE_PIXELS / 1e6} Mpx can be scanned`);
      return pixelsFrom(img, width, height);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageReadError("decode", `${file.name} could not be read as an image`);
  }
  try {
    if (bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) throw new ImageReadError("pixels", `${file.name} has ${pixelsOf(bitmap.width, bitmap.height)}; images up to ${MAX_IMAGE_PIXELS / 1e6} Mpx can be scanned`);
    return pixelsFrom(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/**
 * The first image on the clipboard as a File, or null when the clipboard holds no image or this browser cannot read
 * the clipboard at all. A denied permission rejects, as `navigator.clipboard.read()` does.
 */
export async function readClipboardImage(): Promise<File | null> {
  if (typeof navigator === "undefined" || typeof navigator.clipboard?.read !== "function") return null;
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith("image/"));
    if (!type) continue;
    const blob = await item.getType(type);
    return new File([blob], `pasted.${type.split("/")[1] ?? "png"}`, { type });
  }
  return null;
}
