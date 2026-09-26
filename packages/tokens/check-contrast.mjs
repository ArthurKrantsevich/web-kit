// Fails when a text/background token pair in tokens.css is below WCAG AA (4.5:1) in either theme,
// or when the two dark blocks (system dark and data-theme="dark") differ.
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const failures = [];

function block(selector) {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`tokens.css: no block for ${selector}`);
  const open = css.indexOf("{", start + selector.length - 1);
  const close = css.indexOf("}", open);
  const body = css.slice(open + 1, close);
  return Object.fromEntries([...body.matchAll(/(--wk-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

function luminance(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`not a #rrggbb color: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(match[1].slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [text, background]
const PAIRS = [
  ["fg", "bg"], ["fg", "surface"], ["fg", "surface-2"],
  ["muted", "bg"], ["muted", "surface"], ["muted", "surface-2"],
  ["accent", "bg"], ["accent", "surface"],
  ["accent-fg", "accent"], ["primary-fg", "primary"],
  ["danger", "bg"], ["danger", "surface"],
  ["syntax-key", "surface"], ["syntax-string", "surface"], ["syntax-number", "surface"],
  ["syntax-literal", "surface"], ["syntax-punct", "surface"],
];

const light = block(":root {");
const systemDark = block(':root:not([data-theme="light"]) {');
const forcedDark = block(':root[data-theme="dark"] {');
if (JSON.stringify(systemDark) !== JSON.stringify(forcedDark)) {
  failures.push('dark blocks differ: keep @media (prefers-color-scheme: dark) and :root[data-theme="dark"] identical');
}

let checked = 0;
for (const [theme, tokens] of [["light", light], ["dark", { ...light, ...forcedDark }]]) {
  for (const [text, background] of PAIRS) {
    const fg = tokens[`--wk-${text}`];
    const bg = tokens[`--wk-${background}`];
    if (!fg || !bg) {
      failures.push(`${theme}: missing --wk-${fg ? background : text}`);
      continue;
    }
    const value = ratio(fg, bg);
    checked += 1;
    if (value < 4.5) failures.push(`${theme}: --wk-${text} on --wk-${background} is ${value.toFixed(2)}:1, needs 4.5:1`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`contrast OK: ${checked} pairs`);
