import { describe, expect, it } from "vitest";
import { announceCatalog, selectCatalog } from "./catalog";
import type { ToolMeta, UpcomingTool } from "./registry";

const tool = (id: string, category: ToolMeta["category"], tags: string[] = []): ToolMeta => ({
  id,
  title: id.toUpperCase(),
  description: `The ${id} tool`,
  preview: "",
  category,
  tags,
  pkg: `@web-kit/${id}`,
  usage: "",
  api: [],
});
const planned = (id: string, category: UpcomingTool["category"]): UpcomingTool => ({
  id,
  title: id.toUpperCase(),
  category,
  description: `Planned ${id}`,
  preview: `${id}\n…`,
});

const TOOLS = [tool("json", "data", ["format"]), tool("diff", "data")];
const UPCOMING = [planned("jwt", "data"), planned("uuid", "generators"), planned("hash", "generators")];
const ids = (list: { id: string }[]) => list.map((entry) => entry.id);

describe("selectCatalog", () => {
  it("lists every ready tool, then every planned one, when nothing is chosen", () => {
    const catalog = selectCatalog(TOOLS, UPCOMING, "", "all");
    expect([ids(catalog.ready), ids(catalog.soon), catalog.empty]).toEqual([["json", "diff"], ["jwt", "uuid", "hash"], null]);
  });

  it("finds ready tools by title, description and tags, planned ones by title and description", () => {
    expect(ids(selectCatalog(TOOLS, UPCOMING, "FORMAT", "all").ready)).toEqual(["json"]);
    const jwt = selectCatalog(TOOLS, UPCOMING, "  jwt ", "all");
    expect([ids(jwt.ready), ids(jwt.soon), jwt.empty]).toEqual([[], ["jwt"], null]);
    expect(ids(selectCatalog(TOOLS, UPCOMING, "planned hash", "all").soon)).toEqual(["hash"]);
  });

  it("explains a search with no result, quoting the words as typed", () => {
    expect(selectCatalog(TOOLS, UPCOMING, " Zzz ", "all").empty).toEqual({ kind: "search", query: "Zzz" });
    expect(selectCatalog(TOOLS, UPCOMING, "zzz", "generators").empty).toEqual({ kind: "search", query: "zzz" });
  });

  it("explains a category without ready tools and keeps its planned ones", () => {
    const catalog = selectCatalog(TOOLS, UPCOMING, "", "generators");
    expect([ids(catalog.ready), ids(catalog.soon), catalog.empty]).toEqual([
      [],
      ["uuid", "hash"],
      { kind: "category", category: "generators", planned: 2 },
    ]);
    expect(selectCatalog(TOOLS, UPCOMING, "", "media").empty).toEqual({ kind: "category", category: "media", planned: 0 });
  });

  it("does not explain a category search that finds a planned tool", () => {
    expect(selectCatalog(TOOLS, UPCOMING, "uuid", "generators").empty).toBeNull();
  });
});

describe("announceCatalog", () => {
  const say = (query: string, filter: Parameters<typeof selectCatalog>[3]) => announceCatalog(selectCatalog(TOOLS, UPCOMING, query, filter), query, filter);

  it("says nothing before the user searches or picks a category", () => {
    expect(say("", "all")).toBe("");
  });

  it("counts what a search or a category finds", () => {
    expect(say("json", "all")).toBe("1 tool ready, 0 planned");
    expect(say("", "data")).toBe("2 tools ready, 1 planned");
    expect(say("hash", "all")).toBe("0 tools ready, 1 planned");
  });

  it("reads the empty message aloud", () => {
    expect(say("  zzz ", "all")).toBe("Nothing matches “zzz”. Try a shorter word, or browse every tool.");
    expect(say("", "generators")).toBe("No Generators tools yet. 2 are planned.");
    expect(say("", "media")).toBe("No Media tools yet. Nothing is planned here yet.");
  });
});
