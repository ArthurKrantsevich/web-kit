import { describe, expect, it } from "vitest";
import { CATEGORIES, tools, upcoming } from "./registry";

describe("registry", () => {
  it("gives every planned tool a kebab-case id, a category, a title and a description", () => {
    for (const tool of upcoming) {
      expect([tool.id, /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(tool.id)]).toEqual([tool.id, true]);
      expect([tool.id, CATEGORIES.includes(tool.category)]).toEqual([tool.id, true]);
      expect([tool.id, tool.title.trim() !== "", tool.description.trim() !== ""]).toEqual([tool.id, true, true]);
    }
  });

  it("gives every planned tool its own short preview: 2 to 4 lines of plain text, like a ready tool's card", () => {
    for (const tool of upcoming) {
      const lines = tool.preview.split("\n");
      expect([tool.id, lines.length >= 2 && lines.length <= 4]).toEqual([tool.id, true]);
      expect([tool.id, lines.filter((line) => line.length > 28)]).toEqual([tool.id, []]);
    }
    const previews = upcoming.map((tool) => tool.preview);
    expect(new Set(previews).size).toBe(previews.length);
  });

  it("lists Text Compare, the UUID, password and hash generators and Code Scanner as ready, not planned", () => {
    for (const id of ["text-compare", "uuid-generator", "password-generator", "hash-generator", "code-scanner"]) {
      expect([id, tools.some((tool) => tool.id === id), upcoming.some((tool) => tool.id === id)]).toEqual([id, true, false]);
    }
  });

  it("has no id twice, among ready and planned tools together", () => {
    const ids = [...tools, ...upcoming].map((tool) => tool.id);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  });

  it("plans the tools of the first release that are not ready yet", () => {
    expect(upcoming.map((tool) => `${tool.category}:${tool.id}`)).toEqual([
      "data:base64",
      "data:url-encoder",
      "data:jwt-decoder",
      "generators:qr-generator",
      "generators:palette-generator",
      "media:image-converter",
      "media:video-player",
    ]);
  });
});
