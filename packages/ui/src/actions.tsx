import { forwardRef, type ForwardRefExoticComponent, type ReactElement, type RefAttributes } from "react";
import { Button, type ButtonProps } from "./Button";
import type { IconName } from "./Icon";

/** Where an action may sit: the header of an input pane, the toolbar, or the header of an output pane. */
export type ActionPlace = "input" | "toolbar" | "output";

export interface ActionSpec {
  /** The visible label, and the accessible name unless the tool gives a longer one ("Paste into Left"). */
  label: string;
  /** Empty for "custom": the tool brings its own. */
  icon: IconName | "";
  places: readonly ActionPlace[];
  /** Position among the actions of one row: a row lists its actions by this number, lowest first. */
  order: number;
  /** Only the icon is visible at every width. */
  iconOnly?: true;
  /** The tooltip, with `{name}` slots filled by the tool's words; a missing word leaves nothing. */
  tooltip: string;
}

export type ActionId = "open" | "paste" | "custom" | "download" | "copy" | "sample" | "clear" | "more";

/**
 * The shared actions of every tool: icon, label, tooltip template and place. Buttons built from it carry
 * `data-action="<id>"`, so a test can compare any tool's rows with this table.
 */
export const ACTIONS: Readonly<Record<ActionId, ActionSpec>> = {
  open: {
    label: "Open file",
    icon: "open",
    places: ["input"],
    order: 1,
    tooltip: "Open a {types} file{into} (up to {limit}), or drop it on {target}",
  },
  paste: { label: "Paste", icon: "paste", places: ["input"], order: 2, tooltip: "Paste from the clipboard{into}" },
  custom: { label: "", icon: "", places: ["output", "toolbar"], order: 3, tooltip: "" },
  download: { label: "Download", icon: "download", places: ["output"], order: 4, tooltip: "Save {what} as {file}" },
  copy: { label: "Copy", icon: "copy", places: ["output"], order: 5, tooltip: "Copy {what} to the clipboard" },
  sample: { label: "Sample", icon: "sample", places: ["toolbar"], order: 6, tooltip: "Replace {target} with an example" },
  clear: { label: "Clear", icon: "clear", places: ["toolbar"], order: 7, tooltip: "Empty {target}" },
  more: {
    label: "More actions",
    icon: "more",
    places: ["toolbar"],
    order: 8,
    iconOnly: true,
    tooltip: "Load from a URL, share, save, keyboard shortcuts",
  },
};

/** The action's tooltip with its slots filled: `actionTooltip("clear", { target: "both sides" })` → "Empty both sides". */
export function actionTooltip(id: ActionId, words: Record<string, string> = {}): string {
  return ACTIONS[id].tooltip.replace(/\{(\w+)\}/g, (_, name: string) => words[name] ?? "");
}

export interface ActionButtonProps extends ButtonProps {
  action: ActionId;
  /** Words for the tooltip template; ignored when `tooltip` is given. */
  words?: Record<string, string>;
}

/**
 * A quiet button for one of the shared actions: the table's icon, label and tooltip unless given, and
 * `data-action`. Below 640 px of component width only the icon shows; the label stays the accessible name.
 */
export const ActionButton: ForwardRefExoticComponent<ActionButtonProps & RefAttributes<HTMLButtonElement>> = forwardRef<
  HTMLButtonElement,
  ActionButtonProps
>(function ActionButton({ action, words, icon, tooltip, children, ...rest }, ref): ReactElement {
  const spec = ACTIONS[action];
  return (
    <Button
      ref={ref}
      variant="quiet"
      icon={icon ?? (spec.icon || undefined)}
      tooltip={tooltip ?? actionTooltip(action, words)}
      iconOnly={spec.iconOnly}
      data-action={action}
      {...rest}
    >
      {children ?? spec.label}
    </Button>
  );
});
