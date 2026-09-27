import { expect, test } from "@playwright/test";

test.describe("favicon", () => {
  test("every page links the SVG, ICO and Apple icons under the base path, and they are served", async ({ page, request }) => {
    for (const path of ["./", "about/", "tools/json-diff/"]) {
      await page.goto(path);
      const links = await page.evaluate(() =>
        [...document.head.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')].map((link) => [
          link.getAttribute("rel"),
          link.getAttribute("type"),
          new URL(link.getAttribute("href")!, location.href).pathname,
        ]),
      );
      expect(links).toEqual([
        ["icon", "image/svg+xml", "/web-kit/icon.svg"],
        ["icon", "image/x-icon", "/web-kit/icon.ico"],
        ["apple-touch-icon", "image/png", "/web-kit/apple-icon.png"],
      ]);
    }
    for (const [file, type] of [
      ["icon.svg", "image/svg+xml"],
      ["icon.ico", "image/x-icon"],
      ["apple-icon.png", "image/png"],
    ]) {
      const response = await request.get(file);
      expect([file, response.status(), response.headers()["content-type"]]).toEqual([file, 200, type]);
    }
    // One opaque variant that reads on light and dark tabs alike: the dark tile with light braces of the header mark.
    const svg = await (await request.get("icon.svg")).text();
    expect(svg).not.toContain("prefers-color-scheme");
    expect(svg).toContain('fill="#141413"');
    expect(svg).toContain('stroke="#faf9f5"');
  });
});
