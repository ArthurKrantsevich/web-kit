import type { ReactElement } from "react";

export type IconName =
  | "open"
  | "paste"
  | "sample"
  | "clear"
  | "copy"
  | "check"
  | "download"
  | "to-input"
  | "swap"
  | "generate"
  | "undo"
  | "chevron-down"
  | "chevron-up"
  | "more"
  | "close"
  | "expand"
  | "collapse";

const PATHS: Record<IconName, string> = {
  open: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  paste: "M9 3h6v4H9zM9 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-3",
  sample: "M4 4h16v16H4zM8 9h8M8 13h8M8 17h5",
  clear: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  check: "M5 12.5l4.5 4.5L19 7",
  download: "M12 3v12M7 10l5 5 5-5M4 19h16",
  "to-input": "M19 12H5M11 6l-6 6 6 6",
  swap: "M7 4L3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7",
  generate: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6",
  undo: "M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  "chevron-down": "M6 9l6 6 6-6",
  "chevron-up": "M6 15l6-6 6 6",
  more: "M4.5 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M10.5 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M16.5 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0",
  close: "M6 6l12 12M18 6L6 18",
  expand: "M7 15l5 5 5-5M7 9l5-5 5 5",
  collapse: "M7 4l5 5 5-5M7 20l5-5 5 5",
};

export interface IconProps {
  name: IconName;
  /** Width and height in pixels. Default 16. */
  size?: number;
}

/** A stroke icon that follows the text color. Decorative: hidden from assistive technology. */
export function Icon({ name, size = 16 }: IconProps): ReactElement {
  return (
    <svg
      className="wk-ui-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
