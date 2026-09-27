"use client";

export { Icon, type IconName, type IconProps } from "./Icon";
export { Tooltip, TOOLTIP_DELAY, type TooltipProps } from "./Tooltip";
export { Button, CopyButton, COPY_FEEDBACK_MS, type ButtonProps, type ButtonVariant, type CopyButtonProps } from "./Button";
export { Segmented, type SegmentedOption, type SegmentedProps } from "./Segmented";
export { Select, type SelectOption, type SelectProps } from "./Select";
export {
  EditorPane,
  EditorPanes,
  EditorShell,
  EditorToolbar,
  StatusLine,
  type EditorPaneProps,
  type EditorShellProps,
  type StatusLineProps,
  type StatusState,
} from "./Editor";
export { OpenFileButton, PasteButton, type OpenFileButtonProps, type PasteButtonProps } from "./FileActions";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { downloadText, readTextFile, type Result } from "./files";
export { Dialog, type DialogProps } from "./Dialog";
export {
  acceptsFile,
  useFileDrop,
  type FileDrop,
  type FileDropProps,
  type FileReadOptions,
  type UseFileDropOptions,
} from "./drop";
export { Menu, type MenuItem, type MenuProps } from "./Menu";
export { loadFromUrl, UNREACHABLE, type LoadFromUrlOptions } from "./url";
export {
  canShare,
  compressText,
  decompressText,
  SHARE_MAX_LENGTH,
  SHARE_WARNING_LENGTH,
  useShareHash,
  type ShareHash,
} from "./share";
export { NOT_SAVED, SAVE_DELAY, usePersistentState, type PersistentState } from "./storage";
export { formatHotkey, isApplePlatform, matchHotkey, useApplePlatform, useHotkeys, type HotkeyMap } from "./hotkeys";
export { useHydrated } from "./hydrated";
export { ToolMenu, type Shortcut, type ToolMenuProps, type UrlTarget } from "./ToolMenu";
