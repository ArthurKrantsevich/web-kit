import { compareNumbers } from "./numbers";
import { compareCodePoints } from "./print";
import type { JsonNode, JsonPath } from "./types";

export interface QueryMatch {
  path: JsonPath;
  node: JsonNode;
}

export interface QueryError {
  message: string;
  /** 1-based column in the query. */
  column: number;
}

export type QueryResult = { ok: true; value: QueryMatch[] } | { ok: false; error: QueryError };

type Selector =
  | { kind: "name"; name: string }
  | { kind: "wildcard" }
  | { kind: "index"; index: number }
  | { kind: "slice"; start: number | null; end: number | null; step: number | null }
  | { kind: "filter"; expr: Expr };

interface Segment {
  descendant: boolean;
  selectors: Selector[];
}

interface Query {
  root: "$" | "@";
  segments: Segment[];
}

type Comparable = { kind: "literal"; node: JsonNode } | { kind: "query"; query: Query };

type Op = "==" | "!=" | "<=" | ">=" | "<" | ">";

type Expr =
  | { kind: "or" | "and"; left: Expr; right: Expr }
  | { kind: "not"; expr: Expr }
  | { kind: "exists"; query: Query }
  | { kind: "compare"; op: Op; left: Comparable; right: Comparable };

class QueryFailure {
  constructor(
    readonly message: string,
    readonly at: number,
  ) {}
}

const OPS: Op[] = ["==", "!=", "<=", ">=", "<", ">"];
const INTEGER = /-?(?:0|[1-9]\d*)/y;
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const NAME_FIRST = /[A-Za-z_\u0080-￿]/;
const NAME_CHAR = /[A-Za-z0-9_\u0080-￿]/;
const MAX_INT = 2 ** 53 - 1;

class Parser {
  i = 0;
  constructor(readonly text: string) {}

  fail(message: string, at: number = this.i): never {
    throw new QueryFailure(message, at);
  }

  skipWs(): void {
    while (/[ \t\n\r]/.test(this.text[this.i] ?? "")) this.i++;
  }

  query(root: "$" | "@"): Query {
    if (this.text[this.i] !== root) this.fail(root === "$" ? "A JSONPath query starts with $" : "Expected @");
    this.i++;
    const segments: Segment[] = [];
    for (;;) {
      const save = this.i;
      this.skipWs();
      if (this.text.startsWith("..", this.i)) {
        this.i += 2;
        segments.push({ descendant: true, selectors: this.afterDescendant() });
      } else if (this.text[this.i] === ".") {
        this.i++;
        if (this.text[this.i] === "*") {
          this.i++;
          segments.push({ descendant: false, selectors: [{ kind: "wildcard" }] });
        } else {
          const name = this.name();
          if (name === null) this.fail("Expected a name or * after .");
          segments.push({ descendant: false, selectors: [{ kind: "name", name }] });
        }
      } else if (this.text[this.i] === "[") {
        segments.push({ descendant: false, selectors: this.bracket() });
      } else {
        this.i = save;
        return { root, segments };
      }
    }
  }

  afterDescendant(): Selector[] {
    const ch = this.text[this.i];
    if (ch === "[") return this.bracket();
    if (ch === "*") {
      this.i++;
      return [{ kind: "wildcard" }];
    }
    const name = this.name();
    if (name === null) this.fail("Expected a name, * or [ after ..");
    return [{ kind: "name", name }];
  }

  name(): string | null {
    const start = this.i;
    if (!NAME_FIRST.test(this.text[this.i] ?? "")) return null;
    while (NAME_CHAR.test(this.text[this.i] ?? "")) this.i++;
    return this.text.slice(start, this.i);
  }

  bracket(): Selector[] {
    this.i++;
    this.skipWs();
    const selectors = [this.selector()];
    for (;;) {
      this.skipWs();
      if (this.text[this.i] === ",") {
        this.i++;
        this.skipWs();
        selectors.push(this.selector());
        continue;
      }
      if (this.text[this.i] === "]") {
        this.i++;
        return selectors;
      }
      this.fail("Expected , or ]");
    }
  }

  selector(): Selector {
    const ch = this.text[this.i];
    if (ch === "'" || ch === '"') return { kind: "name", name: this.string() };
    if (ch === "*") {
      this.i++;
      return { kind: "wildcard" };
    }
    if (ch === "?") {
      this.i++;
      this.skipWs();
      return { kind: "filter", expr: this.or() };
    }
    if (ch === "-" || ch === ":" || (ch !== undefined && ch >= "0" && ch <= "9")) return this.indexOrSlice();
    return this.fail("Expected a selector: a quoted name, *, an index, a slice or ?filter");
  }

  integer(): number | null {
    const start = this.i;
    INTEGER.lastIndex = this.i;
    const match = INTEGER.exec(this.text);
    if (!match) return null;
    if (match[0] === "-0") this.fail("-0 is not a valid index", start);
    const next = this.text[this.i + match[0].length];
    if (next !== undefined && next >= "0" && next <= "9") this.fail("Integers cannot have leading zeros", start);
    this.i += match[0].length;
    const value = Number(match[0]);
    if (Math.abs(value) > MAX_INT) this.fail("Integer is out of range", start);
    return value;
  }

  indexOrSlice(): Selector {
    const start = this.integer();
    this.skipWs();
    if (this.text[this.i] !== ":") {
      if (start === null) this.fail("Expected an index");
      return { kind: "index", index: start };
    }
    this.i++;
    this.skipWs();
    const end = this.integer();
    this.skipWs();
    let step: number | null = null;
    if (this.text[this.i] === ":") {
      this.i++;
      this.skipWs();
      step = this.integer();
    }
    return { kind: "slice", start, end, step };
  }

  string(): string {
    const start = this.i;
    const quote = this.text[this.i]!;
    this.i++;
    let value = "";
    while (this.i < this.text.length) {
      const ch = this.text[this.i]!;
      if (ch === quote) {
        this.i++;
        return value;
      }
      if (ch === "\\") {
        const esc = this.text[this.i + 1];
        const simple: Record<string, string> = { b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", "/": "/", "\\": "\\" };
        if (esc === quote) value += quote;
        else if (esc !== undefined && esc in simple) value += simple[esc];
        else if (esc === "u" && /^[0-9a-fA-F]{4}$/.test(this.text.slice(this.i + 2, this.i + 6))) {
          value += String.fromCharCode(parseInt(this.text.slice(this.i + 2, this.i + 6), 16));
          this.i += 6;
          continue;
        } else this.fail("Invalid escape in string");
        this.i += 2;
        continue;
      }
      if (ch < " ") this.fail("Control character in string");
      value += ch;
      this.i++;
    }
    return this.fail("Unterminated string", start);
  }

  or(): Expr {
    let left = this.and();
    for (;;) {
      this.skipWs();
      if (!this.text.startsWith("||", this.i)) return left;
      this.i += 2;
      left = { kind: "or", left, right: this.and() };
    }
  }

  and(): Expr {
    let left = this.basic();
    for (;;) {
      this.skipWs();
      if (!this.text.startsWith("&&", this.i)) return left;
      this.i += 2;
      left = { kind: "and", left, right: this.basic() };
    }
  }

  basic(): Expr {
    this.skipWs();
    if (this.text[this.i] === "!") {
      this.i++;
      this.skipWs();
      return { kind: "not", expr: this.basic() };
    }
    if (this.text[this.i] === "(") {
      this.i++;
      const expr = this.or();
      this.skipWs();
      if (this.text[this.i] !== ")") this.fail("Expected )");
      this.i++;
      return expr;
    }
    const start = this.i;
    const left = this.comparable();
    this.skipWs();
    const op = OPS.find((candidate) => this.text.startsWith(candidate, this.i));
    if (!op) {
      if (left.kind === "literal") this.fail("A value alone is not a test; compare it with something", start);
      return { kind: "exists", query: left.query };
    }
    this.i += op.length;
    this.skipWs();
    const rightStart = this.i;
    const right = this.comparable();
    this.requireSingular(left, start);
    this.requireSingular(right, rightStart);
    return { kind: "compare", op, left, right };
  }

  requireSingular(value: Comparable, at: number): void {
    if (value.kind !== "query") return;
    const singular = value.query.segments.every(
      (segment) =>
        !segment.descendant &&
        segment.selectors.length === 1 &&
        (segment.selectors[0]!.kind === "name" || segment.selectors[0]!.kind === "index"),
    );
    if (!singular) this.fail("Comparisons need a single value; this query can select many", at);
  }

  comparable(): Comparable {
    const ch = this.text[this.i];
    if (ch === "@" || ch === "$") return { kind: "query", query: this.query(ch) };
    if (ch === "'" || ch === '"') {
      const value = this.string();
      return { kind: "literal", node: { type: "string", start: 0, end: 0, raw: JSON.stringify(value), value } };
    }
    NUMBER.lastIndex = this.i;
    const number = NUMBER.exec(this.text);
    if (number) {
      this.i += number[0].length;
      return { kind: "literal", node: { type: "number", start: 0, end: 0, raw: number[0] } };
    }
    for (const word of ["true", "false", "null"] as const) {
      if (this.text.startsWith(word, this.i) && !NAME_CHAR.test(this.text[this.i + word.length] ?? "")) {
        this.i += word.length;
        const node: JsonNode = word === "null" ? { type: "null", start: 0, end: 0 } : { type: "boolean", start: 0, end: 0, value: word === "true" };
        return { kind: "literal", node };
      }
    }
    const start = this.i;
    if (this.name() !== null && this.text[this.i] === "(") this.fail("Function extensions like length() are not supported", start);
    return this.fail("Expected a value, @ or $", start);
  }
}

function childrenOf(match: QueryMatch): QueryMatch[] {
  const { node, path } = match;
  if (node.type === "object") return node.members.map((member) => ({ path: [...path, member.key.value], node: member.value }));
  if (node.type === "array") return node.items.map((item, index) => ({ path: [...path, index], node: item }));
  return [];
}

function descendants(match: QueryMatch, out: QueryMatch[]): QueryMatch[] {
  out.push(match);
  for (const child of childrenOf(match)) descendants(child, out);
  return out;
}

function deepEqual(a: JsonNode, b: JsonNode): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "number":
      return compareNumbers(a.raw, (b as typeof a).raw) === 0;
    case "string":
      return a.value === (b as typeof a).value;
    case "boolean":
      return a.value === (b as typeof a).value;
    case "null":
      return true;
    case "array": {
      const other = b as typeof a;
      return a.items.length === other.items.length && a.items.every((item, index) => deepEqual(item, other.items[index]!));
    }
    case "object": {
      const left = new Map(a.members.map((member) => [member.key.value, member.value]));
      const right = new Map((b as typeof a).members.map((member) => [member.key.value, member.value]));
      if (left.size !== right.size) return false;
      for (const [key, value] of left) {
        const counterpart = right.get(key);
        if (!counterpart || !deepEqual(value, counterpart)) return false;
      }
      return true;
    }
  }
}

function lessThan(a: JsonNode | undefined, b: JsonNode | undefined): boolean {
  if (!a || !b) return false;
  if (a.type === "number" && b.type === "number") return compareNumbers(a.raw, b.raw) < 0;
  if (a.type === "string" && b.type === "string") return compareCodePoints(a.value, b.value) < 0;
  return false;
}

function compare(op: Op, a: JsonNode | undefined, b: JsonNode | undefined): boolean {
  const equal = a === undefined || b === undefined ? a === b : deepEqual(a, b);
  switch (op) {
    case "==":
      return equal;
    case "!=":
      return !equal;
    case "<":
      return lessThan(a, b);
    case "<=":
      return lessThan(a, b) || equal;
    case ">":
      return lessThan(b, a);
    case ">=":
      return lessThan(b, a) || equal;
  }
}

function select(selector: Selector, match: QueryMatch, root: JsonNode, out: QueryMatch[]): void {
  const { node, path } = match;
  switch (selector.kind) {
    case "name": {
      if (node.type !== "object") return;
      let found: JsonNode | undefined;
      for (const member of node.members) if (member.key.value === selector.name) found = member.value;
      if (found) out.push({ path: [...path, selector.name], node: found });
      return;
    }
    case "wildcard":
      out.push(...childrenOf(match));
      return;
    case "index": {
      if (node.type !== "array") return;
      const index = selector.index < 0 ? node.items.length + selector.index : selector.index;
      const item = node.items[index];
      if (item && index >= 0) out.push({ path: [...path, index], node: item });
      return;
    }
    case "slice": {
      if (node.type !== "array") return;
      const length = node.items.length;
      const step = selector.step ?? 1;
      if (step === 0) return;
      const normalize = (value: number): number => (value >= 0 ? value : length + value);
      const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high);
      if (step > 0) {
        const lower = clamp(normalize(selector.start ?? 0), 0, length);
        const upper = clamp(normalize(selector.end ?? length), 0, length);
        for (let i = lower; i < upper; i += step) out.push({ path: [...path, i], node: node.items[i]! });
      } else {
        const upper = clamp(normalize(selector.start ?? length - 1), -1, length - 1);
        const lower = clamp(normalize(selector.end ?? -length - 1), -1, length - 1);
        for (let i = upper; lower < i; i += step) out.push({ path: [...path, i], node: node.items[i]! });
      }
      return;
    }
    case "filter":
      for (const child of childrenOf(match)) if (test(selector.expr, child, root)) out.push(child);
      return;
  }
}

function evaluate(query: Query, root: JsonNode, current: QueryMatch): QueryMatch[] {
  let nodes: QueryMatch[] = [query.root === "$" ? { path: [], node: root } : current];
  for (const segment of query.segments) {
    const next: QueryMatch[] = [];
    for (const match of nodes) {
      const targets = segment.descendant ? descendants(match, []) : [match];
      for (const target of targets) for (const selector of segment.selectors) select(selector, target, root, next);
    }
    nodes = next;
  }
  return nodes;
}

function valueOf(value: Comparable, current: QueryMatch, root: JsonNode): JsonNode | undefined {
  return value.kind === "literal" ? value.node : evaluate(value.query, root, current)[0]?.node;
}

function test(expr: Expr, current: QueryMatch, root: JsonNode): boolean {
  switch (expr.kind) {
    case "or":
      return test(expr.left, current, root) || test(expr.right, current, root);
    case "and":
      return test(expr.left, current, root) && test(expr.right, current, root);
    case "not":
      return !test(expr.expr, current, root);
    case "exists":
      return evaluate(expr.query, root, current).length > 0;
    case "compare":
      return compare(expr.op, valueOf(expr.left, current, root), valueOf(expr.right, current, root));
  }
}

/** Runs a JSONPath query (RFC 9535 subset). Never throws on a bad query; returns an error with a column instead. */
export function queryJson(root: JsonNode, query: string): QueryResult {
  const parser = new Parser(query);
  try {
    const parsed = parser.query("$");
    parser.skipWs();
    if (parser.i < query.length) parser.fail(`Unexpected character '${query[parser.i]}'`);
    return { ok: true, value: evaluate(parsed, root, { path: [], node: root }) };
  } catch (e) {
    if (!(e instanceof QueryFailure)) throw e;
    return { ok: false, error: { message: e.message, column: e.at + 1 } };
  }
}

function scalarText(node: JsonNode): string | null {
  switch (node.type) {
    case "string":
      return node.value;
    case "number":
      return node.raw;
    case "boolean":
      return String(node.value);
    case "null":
      return "null";
    default:
      return null;
  }
}

/** Case-insensitive search over keys and scalar values, in document order. */
export function searchJson(root: JsonNode, text: string): QueryMatch[] {
  const needle = text.toLowerCase();
  if (needle === "") return [];
  const out: QueryMatch[] = [];
  const visit = (node: JsonNode, path: JsonPath, key: string | null): void => {
    const value = scalarText(node);
    if ((key !== null && key.toLowerCase().includes(needle)) || (value !== null && value.toLowerCase().includes(needle))) {
      out.push({ path, node });
    }
    if (node.type === "object") for (const member of node.members) visit(member.value, [...path, member.key.value], member.key.value);
    else if (node.type === "array") node.items.forEach((item, index) => visit(item, [...path, index], null));
  };
  visit(root, [], null);
  return out;
}
