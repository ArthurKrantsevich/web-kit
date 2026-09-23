import { describe, expect, it } from "vitest";
import { formatPath } from "./path";
import { queryJson, searchJson } from "./query";
import type { JsonNode } from "./types";
import { parseJson } from "./validate";

function parsed(input: string): JsonNode {
  const result = parseJson(input);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

const STORE = parsed(`{ "store": {
  "book": [
    { "category": "reference", "author": "Nigel Rees", "title": "Sayings of the Century", "price": 8.95 },
    { "category": "fiction", "author": "Evelyn Waugh", "title": "Sword of Honour", "price": 12.99 },
    { "category": "fiction", "author": "Herman Melville", "title": "Moby Dick", "isbn": "0-553-21311-3", "price": 8.99 },
    { "category": "fiction", "author": "J. R. R. Tolkien", "title": "The Lord of the Rings", "isbn": "0-395-19395-8", "price": 22.99 }
  ],
  "bicycle": { "color": "red", "price": 399 }
} }`);

function paths(root: JsonNode, query: string): string[] {
  const result = queryJson(root, query);
  if (!result.ok) throw new Error(`${result.error.column}: ${result.error.message}`);
  return result.value.map((match) => formatPath(match.path));
}

function error(root: JsonNode, query: string) {
  const result = queryJson(root, query);
  if (result.ok) throw new Error("expected an error");
  return result.error;
}

describe("queryJson on the RFC 9535 bookstore", () => {
  const books = (...indexes: number[]) => indexes.map((i) => `$.store.book[${i}]`);

  it.each([
    ["$.store.book[*].author", books(0, 1, 2, 3).map((p) => `${p}.author`)],
    ["$..author", books(0, 1, 2, 3).map((p) => `${p}.author`)],
    ["$.store.*", ["$.store.book", "$.store.bicycle"]],
    ["$.store..price", [...books(0, 1, 2, 3).map((p) => `${p}.price`), "$.store.bicycle.price"]],
    ["$..book[2]", books(2)],
    ["$..book[-1]", books(3)],
    ["$..book[0,1]", books(0, 1)],
    ["$..book[:2]", books(0, 1)],
    ["$..book[?@.isbn]", books(2, 3)],
    ["$..book[?@.price<10]", books(0, 2)],
    ["$.store.book[?@.category == 'fiction' && @.price > 20].title", ["$.store.book[3].title"]],
    ["$['store'][\"bicycle\"].color", ["$.store.bicycle.color"]],
  ])("%s", (query, expected) => {
    expect(paths(STORE, query)).toEqual(expected);
  });

  it("$..* lists every node below the root", () => {
    expect(paths(STORE, "$..*")).toHaveLength(27);
  });
});

describe("queryJson filters", () => {
  it("compares numbers exactly", () => {
    expect(paths(parsed('[{"a":1},{"a":1.0},{"a":"1"},{"b":1}]'), "$[?@.a == 1]")).toEqual(["$[0]", "$[1]"]);
    expect(paths(parsed("[12345678901234567890, 1]"), "$[?@ > 12345678901234567889]")).toEqual(["$[0]"]);
  });

  it("treats two missing values as equal (RFC 9535)", () => {
    expect(paths(parsed('[{"x":1}]'), "$[?@.a == @.b]")).toEqual(["$[0]"]);
  });

  it("supports !, &&, || and parentheses", () => {
    const root = parsed('[{"a":1,"b":1},{"a":1,"c":1},{"a":1},{"b":1}]');
    expect(paths(root, "$[?!@.a]")).toEqual(["$[3]"]);
    expect(paths(root, "$[?@.a && (@.b || @.c)]")).toEqual(["$[0]", "$[1]"]);
  });

  it("compares structures deeply and strings by code point", () => {
    const root = parsed('{"ref":[1,2],"items":[{"a":[1,2]},{"a":[2,1]}]}');
    expect(paths(root, "$.items[?@.a == $.ref]")).toEqual(["$.items[0]"]);
    expect(paths(parsed('["a","c","B","～","😀"]'), '$[?@ < "b"]')).toEqual(["$[0]", "$[2]"]);
    expect(paths(parsed('["～","😀"]'), '$[?@ > "～"]')).toEqual(["$[1]"]);
  });
});

describe("queryJson selectors", () => {
  const list = parsed("[0,1,2,3,4]");

  it.each([
    ["$[1:3]", ["$[1]", "$[2]"]],
    ["$[::-1]", ["$[4]", "$[3]", "$[2]", "$[1]", "$[0]"]],
    ["$[0:5:2]", ["$[0]", "$[2]", "$[4]"]],
    ["$[::0]", []],
    ["$[-2:]", ["$[3]", "$[4]"]],
    ["$[9]", []],
  ])("%s", (query, expected) => {
    expect(paths(list, query)).toEqual(expected);
  });

  it("reads quoted names with escapes", () => {
    const root = parsed('{"a b":1,"x\\"y":2,"it\'s":3,"é":4}');
    expect(paths(root, "$['a b']")).toEqual(['$["a b"]']);
    expect(paths(root, '$["x\\"y"]')).toEqual(['$["x\\"y"]']);
    expect(paths(root, "$['it\\'s']")).toEqual(['$["it\'s"]']);
    expect(paths(root, "$['\\u00e9']")).toEqual(['$["é"]']);
    expect(paths(root, "$.é")).toEqual(['$["é"]']);
  });

  it("accepts surrogate pairs written as escapes", () => {
    expect(paths(parsed('{"😀":1}'), '$["\\uD83D\\uDE00"]')).toEqual(['$["😀"]']);
  });

  it("ignores duplicate keys that a later key overrides, everywhere", () => {
    const root = parsed('{"a":"hit","a":"x"}');
    expect(paths(root, "$.*")).toEqual(["$.a"]);
    expect(searchJson(root, "hit")).toEqual([]);
    expect(searchJson(root, "x").map((match) => formatPath(match.path))).toEqual(["$.a"]);
  });

  it("picks the last of duplicate keys, like JSON.parse", () => {
    const result = queryJson(parsed('{"a":1,"a":2}'), "$.a");
    expect(result.ok && result.value.map((match) => match.node.type === "number" && match.node.raw)).toEqual(["2"]);
  });
});

describe("queryJson errors", () => {
  it.each([
    ["store", "A JSONPath query starts with $", 1],
    ["$.", "Expected a name or * after .", 3],
    ["$..", "Expected a name, * or [ after ..", 4],
    ["$[", "Expected a selector: a quoted name, *, an index, a slice or ?filter", 3],
    ["$['a", "Unterminated string", 3],
    ["$[1", "Expected , or ]", 4],
    ["$[01]", "Integers cannot have leading zeros", 3],
    ["$[?length(@) > 1]", "Function extensions like length() are not supported", 4],
    ["$[?@.a == @.*]", "Comparisons need a single value; this query can select many", 11],
    ["$[?1]", "A value alone is not a test; compare it with something", 4],
    ["$.a b", "Unexpected character 'b'", 5],
    ["$[?!@.x == 1]", "Use !( … ) to negate a comparison", 9],
    ["$[?!!@.a]", "Expected ( or a query after !", 5],
    ['$["\\uD800"]', "Invalid unicode escape: lone surrogate", 4],
    ["$.a ", "Trailing whitespace is not allowed", 4],
    ["$.😀 x", "Unexpected character 'x'", 5],
  ])("%s", (query, message, column) => {
    expect(error(STORE, query)).toEqual({ message, column });
  });
});

describe("searchJson", () => {
  it("finds keys and values, ignoring case, in document order", () => {
    const root = parsed('{"Name":"x","list":[{"name":"ANNA"},{"id":12}],"note":"no match here","n":120}');
    expect(searchJson(root, "name").map((match) => formatPath(match.path))).toEqual(["$.Name", "$.list[0].name"]);
    expect(searchJson(root, "anna").map((match) => formatPath(match.path))).toEqual(["$.list[0].name"]);
    expect(searchJson(root, "12").map((match) => formatPath(match.path))).toEqual(["$.list[1].id", "$.n"]);
    expect(searchJson(root, "")).toEqual([]);
  });
});
