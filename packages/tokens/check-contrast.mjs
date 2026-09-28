// Fails when a text/background token pair in tokens.css is below WCAG AA (4.5:1) in either theme (also on the tints
// Text Compare mixes from tokens for added and removed lines, and Hash Generator for a matching row), when a UI
// component boundary (a border, a strength meter's fill) is below 3:1 against the backgrounds it sits on (WCAG 1.4.11), when a scrollbar thumb
// does not get stronger on hover, or when the two dark blocks (system dark and data-theme="dark") differ. An rgba()
// color is measured over the background it is paired with.
//
// The scrollbar thumb is not held to 3:1: its colors are the approved quiet ones of the design (1.7 to 2.0:1 at rest),
// nothing depends on seeing it (the wheel, the keyboard, touch and the content itself scroll and show the position),
// and forced-colors mode replaces it with system colors. It must only become more visible on hover.
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

/** [r, g, b] in 0..255 of a #rrggbb color. */
function rgb(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`not a #rrggbb color: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(match[1].slice(i, i + 2), 16));
}

/** [r, g, b] of `color` (#rrggbb or rgba(r, g, b, a)) painted over the #rrggbb `background`. */
function over(color, background) {
  const match = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(color);
  if (!match) return rgb(color);
  const alpha = Number(match[4]);
  const under = rgb(background);
  return [1, 2, 3].map((i, k) => Number(match[i]) * alpha + under[k] * (1 - alpha));
}

function luminance([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function ratio(color, background) {
  const [hi, lo] = [luminance(over(color, background)), luminance(rgb(background))].sort((x, y) => y - x);
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

// [component boundary, background]: 3:1 (WCAG 1.4.11, non-text contrast). The fills of the password strength meter
// (weak, fair, strong) sit on its surface-2 track.
const NON_TEXT_PAIRS = [
  ["border-strong", "surface"], ["border-strong", "bg"],
  ["danger", "surface-2"], ["syntax-number", "surface-2"], ["syntax-string", "surface-2"],
];

// [text, color, percent, background]: text on `color` mixed into `background` with color-mix(in srgb): the tints of
// added (string color) and removed (danger) lines in Text Compare, 12 %, and of their changed words, 30 %. 4.5:1.
const MIXED = [
  ["fg", "syntax-string", 12, "surface"], ["muted", "syntax-string", 12, "surface"], ["fg", "syntax-string", 30, "surface"],
  ["fg", "danger", 12, "surface"], ["muted", "danger", 12, "surface"], ["fg", "danger", 30, "surface"],
];

/** #rrggbb of `color` mixed into `background`, `percent` of the first, as color-mix(in srgb) does. */
function mix(color, percent, background) {
  const [a, b] = [rgb(color), rgb(background)];
  return `#${a.map((value, i) => Math.round((value * percent + b[i] * (100 - percent)) / 100).toString(16).padStart(2, "0")).join("")}`;
}

// [thumb at rest, thumb on hover]: on every background it scrolls over, hover must stand out more than rest.
const SCROLLBAR = ["scrollbar", "scrollbar-hover"];
const SCROLLED = ["bg", "surface"];

const light = block(":root {");
const systemDark = block(':root:not([data-theme="light"]) {');
const forcedDark = block(':root[data-theme="dark"] {');
if (JSON.stringify(systemDark) !== JSON.stringify(forcedDark)) {
  failures.push('dark blocks differ: keep @media (prefers-color-scheme: dark) and :root[data-theme="dark"] identical');
}

let checked = 0;
for (const [theme, tokens] of [["light", light], ["dark", { ...light, ...forcedDark }]]) {
  for (const [pairs, needed] of [[PAIRS, 4.5], [NON_TEXT_PAIRS, 3]]) {
    for (const [text, background] of pairs) {
      const fg = tokens[`--wk-${text}`];
      const bg = tokens[`--wk-${background}`];
      if (!fg || !bg) {
        failures.push(`${theme}: missing --wk-${fg ? background : text}`);
        continue;
      }
      const value = ratio(fg, bg);
      checked += 1;
      if (value < needed) failures.push(`${theme}: --wk-${text} on --wk-${background} is ${value.toFixed(2)}:1, needs ${needed}:1`);
    }
  }
}

for (const [theme, tokens] of [["light", light], ["dark", { ...light, ...forcedDark }]]) {
  for (const [text, color, percent, background] of MIXED) {
    const tint = mix(tokens[`--wk-${color}`], percent, tokens[`--wk-${background}`]);
    const value = ratio(tokens[`--wk-${text}`], tint);
    checked += 1;
    if (value < 4.5) failures.push(`${theme}: --wk-${text} on ${percent}% --wk-${color} over --wk-${background} is ${value.toFixed(2)}:1, needs 4.5:1`);
  }
}

for (const [theme, tokens] of [["light", light], ["dark", { ...light, ...forcedDark }]]) {
  const [rest, hover] = SCROLLBAR.map((name) => tokens[`--wk-${name}`]);
  if (!rest || !hover) {
    failures.push(`${theme}: missing --wk-${rest ? SCROLLBAR[1] : SCROLLBAR[0]}`);
    continue;
  }
  for (const background of SCROLLED) {
    const under = tokens[`--wk-${background}`];
    const [atRest, onHover] = [ratio(rest, under), ratio(hover, under)];
    checked += 1;
    if (onHover <= atRest) {
      failures.push(`${theme}: --wk-scrollbar-hover (${onHover.toFixed(2)}:1) is not stronger than --wk-scrollbar (${atRest.toFixed(2)}:1) on --wk-${background}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`contrast OK: ${checked} pairs`);
