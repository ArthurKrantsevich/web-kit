// Renders src/app/icon.svg into the two raster icons that sit next to it, in the light theme:
// - apple-icon.png, 180 × 180, square and opaque (iOS rounds the corners itself and turns transparency black);
// - icon.ico, 32 × 32, one PNG image in an ICO container (every browser since IE 11 reads PNG inside ICO).
// Run it after changing icon.svg: `node scripts/make-icons.mjs`. The outputs are committed; nothing runs at build time.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

const app = new URL("../src/app/", import.meta.url);
const svg = readFileSync(new URL("icon.svg", app), "utf8");

/** The SVG drawn at `size` × `size` CSS pixels, as PNG bytes; transparent outside the shape. */
async function render(browser, markup, size) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, colorScheme: "light" });
  await page.setContent(`<body style="margin:0">${markup.replace("<svg ", `<svg style="display:block;width:${size}px;height:${size}px" `)}</body>`);
  const png = await page.screenshot({ omitBackground: true });
  await page.close();
  return png;
}

/** An ICO file holding one PNG image (ICONDIR, one ICONDIRENTRY, the PNG). */
function ico(png, size) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); // reserved
  head.writeUInt16LE(1, 2); // 1 = icon
  head.writeUInt16LE(1, 4); // one image
  head.writeUInt8(size, 6); // width
  head.writeUInt8(size, 7); // height
  head.writeUInt16LE(1, 10); // colour planes
  head.writeUInt16LE(32, 12); // bits per pixel
  head.writeUInt32LE(png.length, 14);
  head.writeUInt32LE(head.length, 18); // the image starts right after this header
  return Buffer.concat([head, png]);
}

const browser = await chromium.launch();
try {
  // A square without rounded corners for Apple devices; the tab icon keeps the rounded one.
  writeFileSync(new URL("apple-icon.png", app), await render(browser, svg.replace(/ rx="[\d.]+"/, ""), 180));
  writeFileSync(new URL("icon.ico", app), ico(await render(browser, svg, 32), 32));
} finally {
  await browser.close();
}
console.log("make-icons OK: src/app/apple-icon.png, src/app/icon.ico");
