---
"@web-kit/ui": patch
---

Tooltip: keyboard focus shows the tooltip again after a mouse press that was released outside the button; only one tooltip is shown at a time; tooltips hide on window resize. React 18: Button forwards its `ref` (a forwardRef component; `ButtonProps` no longer declares `ref`, which now comes through `RefAttributes<HTMLButtonElement>`), and no layout-effect warning during a server render. `readTextFile` keeps a second U+FEFF that is part of the text. OpenFileButton has `onReadStart`, so a tool can drop a file that finishes reading after the input changed, and it drops an earlier file whose read finishes after a later file was chosen.
