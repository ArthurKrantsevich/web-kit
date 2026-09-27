# @web-kit/ui

The shared React pieces of the web-kit utilities: one look and one behavior for every tool.

> Not published to npm yet. The package name will change before the first release.

```tsx
import { Button, CopyButton, Segmented, Select, Tooltip } from "@web-kit/ui";
import "@web-kit/ui/styles.css";

<Select label="Indent" value={indent} options={[{ value: "2", label: "2 spaces" }, { value: "tab", label: "Tab" }]} onChange={setIndent} />;
<Segmented label="Mode" value={mode} options={[{ value: "format", label: "Format" }, { value: "minify", label: "Minify" }]} onChange={setMode} />;
<Button icon="sample" tooltip="Replace the input with an example" onClick={loadSample}>Sample</Button>;
<CopyButton text={output} tooltip="Copy the output to the clipboard" />;
```

- **Select** is a button with `aria-haspopup="listbox"`; its label is the accessible name and the current value is its description. The list opens in the top layer (Popover API), so no `overflow: hidden` parent clips it, and opens upward when there is no room below. Keyboard: ↓/↑ or Enter/Space open; ↓/↑, Home/End move; Enter/Space pick; a letter jumps to the next option that starts with it; Escape closes and returns focus; Tab closes.
- **Segmented** is a group of `aria-pressed` buttons. Each label reserves the width of its bold form, so picking a segment never changes any button's width.
- **Tooltip** describes its element (`aria-describedby`); it appears after 400 ms of mouse hover or at once on keyboard focus, hides on leave, blur, Escape and click, and never appears for touch.
- **CopyButton** shows "Copy", "✓ Copied" or "Copy failed" in one fixed width and announces the change through a polite live region.
- **EditorShell**, **EditorToolbar**, **EditorPanes**, **EditorPane** and **StatusLine** build the editor layout: a toolbar named "Options", two panes side by side from 1024 px of component width, and a status line. Pane height: `--wk-editor-height` (default `max(420px, 70vh)`).
- **OpenFileButton** and **PasteButton** read a file (UTF-8, BOM removed, size limit) or the clipboard. `downloadText(text, filename, mime)` saves text as a file; `readTextFile(file, maxBytes)` returns `{ ok, value }` or `{ ok: false, error: { message } }`.

Browsers without the Popover API (and jsdom) show the list and the tooltip as plain fixed elements; the list may then be clipped by a parent with `overflow: hidden`.

Every web-kit utility's `styles.css` starts with this package's styles, so an app imports one file per utility. Colors come from `@web-kit/tokens` (`--wk-*`), with light-theme fallbacks.

The styles sit in the `wk-ui` cascade layer, so every utility's own rules win over them whichever utility's file loads last. Unlayered rules in your app win too, whatever their specificity: put element resets such as `button { … }` or `:focus-visible { … }` in a layer (for example `@layer base`, declared before the utilities' files, or `@layer wk-ui.page` to sit under the ui rules in any order).

## License

MIT
