// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyH, homographyFromCorners } from "../src/core/geometry";
import { asImage, blur, compose, contrast, cylinder, damage, glare, gradientLight, invert, noise, rasterize, toRgba } from "../bench/distort";
import { encodeSymbol, segmentsFor } from "./encoders/qr";
import { encodePng } from "./png";
import { zxing } from "./zxing";

const matrix = encodeSymbol("qr", 2, "M", segmentsFor("raster"))!.matrix;

describe("rasterize", () => {
  it("draws modules at the given size with a quiet zone, and reports the symbol's corners", () => {
    const r = rasterize(matrix, { module: 4, quiet: 2 });
    // the canvas holds the symbol with its quiet zone at any rotation: ⌈√2·116⌉ + 8
    expect([r.width, r.height]).toEqual([173, 173]);
    const [x0, y0] = r.corners[0]!;
    // the top-left finder module is dark, the quiet zone light
    expect(r.data[Math.round(y0 + 2) * r.width + Math.round(x0 + 2)]).toBe(0);
    expect(r.data[Math.round(y0 - 4) * r.width + Math.round(x0 - 4)]).toBe(255);
    // the symbol sits 8 px (the quiet zone) inside the 116 px square centred on the 173 px canvas: 28.5 + 8 = 36.5
    expect(r.corners.map((c) => c.map((v) => Math.round(v * 1000) / 1000))).toEqual([[36.5, 36.5], [136.5, 36.5], [136.5, 136.5], [36.5, 136.5]]);
  });

  it("rotates and tilts: the corners follow, and a point mapped through them lands on the symbol", () => {
    const r = rasterize(matrix, { module: 6, rotate: 30, tilt: 0.2, width: 400, height: 400 });
    const H = homographyFromCorners(25, 25, r.corners)!;
    let dark = 0, total = 0;
    for (let v = 0; v < 25; v++) for (let u = 0; u < 25; u++) { const [x, y] = applyH(H, u + 0.5, v + 0.5); total++; if (r.data[Math.round(y) * r.width + Math.round(x)]! < 128 === matrix.get(u, v)) dark++; }
    expect(dark / total).toBeGreaterThan(0.97);
  });

  it("applies deterministic distortions", () => {
    const r = rasterize(matrix, { module: 5 });
    expect(noise(r, 20, 7).data).toEqual(noise(r, 20, 7).data);
    expect(noise(r, 20, 8).data).not.toEqual(noise(r, 20, 7).data);
    expect(blur(r, 1.5).data[Math.round(r.corners[0]![1]) * r.width + Math.round(r.corners[0]![0])]).toBeGreaterThan(0);
    expect(invert(r).data[0]).toBe(0);
    expect(gradientLight(r, 0.5).data[r.width - 1]).toBeLessThan(140);
    expect(glare(r, r.width / 2, r.height / 2, 30).data[Math.round(r.height / 2) * r.width + Math.round(r.width / 2)]).toBe(255);
    const finder = Math.round(r.corners[0]![1] + 2) * r.width + Math.round(r.corners[0]![0] + 2);
    expect([contrast(r, 0.5).data[0], contrast(r, 0.5).data[finder]]).toEqual([192, 64]);
    // a ramp (pixel x holds the value x) makes the cylinder exact: bilinear on a ramp at p gives p − 0.5, so the centre
    // column stays, the column at xo = 45.5 = 0.91·R samples the source at cx + R·asin(0.91), and past the radius it is white
    const ramp = { width: 200, height: 2, data: Uint8Array.from({ length: 400 }, (_, i) => i % 200) }, cyl = cylinder(ramp, 50);
    expect([cyl.width, cyl.height, cyl.data[100]]).toEqual([200, 2, ramp.data[100]]);
    expect(cyl.data[145]).toBe(Math.round(50 * Math.asin(45.5 / 50) + 100 - 0.5)); // 157: pushed outwards from 145
    expect([cyl.data[0], cyl.data[49], cyl.data[150], cyl.data[199]]).toEqual([255, 255, 255, 255]);
    const bent = cylinder(r, r.width);
    expect([bent.width, bent.height, "corners" in bent]).toEqual([r.width, r.height, false]); // a warp does not carry stale corners
    const damaged = damage(r, r.corners, 0.1, 3);
    let changed = 0;
    for (let i = 0; i < r.data.length; i++) if (damaged.data[i] !== r.data[i]) changed++;
    expect(changed).toBeGreaterThan(0);
    // coverage is exact: on a mid-gray plane every painted pixel changes, so the count lands within one blotch of the share
    const gray = { width: 100, height: 100, data: new Uint8Array(10_000).fill(128) }, box: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]];
    let painted = 0;
    for (const v of damage(gray, box, 0.1, 5).data) if (v !== 128) painted++;
    expect(painted).toBeGreaterThanOrEqual(1000);
    expect(painted).toBeLessThan(1000 + Math.PI * 12 * 12);
    const two = compose(600, 300, [{ plane: r, x: 20, y: 20 }, { plane: r, x: 320, y: 40 }]);
    expect([two.width, two.height, two.data[21 * 600 + 21 + Math.round(r.corners[0]![0])]]).toEqual([600, 300, r.data[r.width + 1 + Math.round(r.corners[0]![0])]]);
    // an opaque piece paints its white over what is under it; a plain one only darkens; a fractional offset is rounded, not dropped
    const black = { width: 4, height: 4, data: new Uint8Array(16) }, white = { width: 2, height: 2, data: new Uint8Array(4).fill(255) };
    expect(compose(4, 4, [{ plane: black, x: 0, y: 0 }, { plane: white, x: 1, y: 1 }]).data[5]).toBe(0);
    expect(compose(4, 4, [{ plane: black, x: 0, y: 0 }, { plane: white, x: 1, y: 1, opaque: true }]).data[5]).toBe(255);
    expect(compose(4, 4, [{ plane: black, x: 1.4, y: 0.6 }]).data[5]).toBe(0);
    const rgba = toRgba(r), gray8 = asImage(r);
    expect([rgba.format, rgba.data.length, rgba.data[3]]).toEqual(["rgba", r.width * r.height * 4, 255]);
    expect([gray8.format, gray8.width, gray8.height, gray8.data === r.data]).toEqual(["gray", r.width, r.height, true]);
  });

  it("writes a PNG that decodes back pixel for pixel, and that zxing reads", async () => {
    const sharp = (await import("sharp")).default;
    const r = rasterize(matrix, { module: 6 });
    const png = encodePng(r);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const { data, info } = await sharp(Buffer.from(png)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([r.width, r.height, 4]);
    let same = 0;
    for (let i = 0; i < r.data.length; i++) if (data[i * 4] === r.data[i]) same++;
    expect(same).toBe(r.data.length);
    const zx = await zxing();
    const read = await zx.read({ width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), format: "rgba" });
    expect(read.map((x) => x.text)).toEqual(["raster"]);
  });
});
