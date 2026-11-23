"use client";

import type { ComponentPropsWithRef, KeyboardEvent, ReactNode } from "react";

import { type ForcedState, cx, selectedAttrs } from "./state";

export type SegmentedVariant = "pill" | "square" | "tabs";
export type SegmentedSize = "sm" | "md";

export interface SegmentedItem {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps
  extends Omit<
    ComponentPropsWithRef<"div">,
    "children" | "onChange" | "role" | "aria-label"
  > {
  /** Required: a group of choices needs a name. */
  "aria-label": string;
  items: readonly SegmentedItem[];
  value: string;
  onChange: (value: string) => void;
  /** pill (default) and square are a choice in a groove; tabs is a bare bar. */
  variant?: SegmentedVariant;
  /** sm is 28 (dense), md is 44 (touch). */
  size?: SegmentedSize;
  /** Stretch to the width of the parent; the items share it equally. */
  fill?: boolean;
  /** Hold one item in a state the pointer cannot hold (the /admin/ds page). */
  force?: { value: string; state: ForcedState };
}

/**
 * The one segmented control, and the tab bar: the *-seg and *-tabs families
 * (phone range and view pickers, the desktop week / month switch, settings
 * tabs). pill and square read as a radio group (aria-checked); tabs reads as a
 * tablist (aria-selected). Arrow keys, Home and End move the choice and skip
 * what is disabled.
 */
export function Segmented({
  items,
  value,
  onChange,
  variant = "pill",
  size = "sm",
  fill,
  force,
  className,
  onKeyDown,
  ...rest
}: SegmentedProps) {
  const isTabs = variant === "tabs";

  function move(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const keys = [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
    ];
    if (!keys.includes(event.key)) return;
    const enabled = items.filter((item) => !item.disabled);
    if (!enabled.length) return;
    const at = enabled.findIndex((item) => item.value === value);
    let next = at;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = enabled.length - 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (at <= 0 ? enabled.length : at) - 1;
    else next = (at + 1) % enabled.length;
    event.preventDefault();
    const target = enabled[next];
    onChange(target.value);
    const group = event.currentTarget;
    queueMicrotask(() =>
      group
        .querySelector<HTMLElement>(
          `[data-value="${CSS.escape(target.value)}"]`
        )
        ?.focus()
    );
  }

  return (
    <div
      {...rest}
      role={isTabs ? "tablist" : "radiogroup"}
      className={cx("ds-seg", className)}
      data-variant={variant}
      data-size={size}
      data-fill={fill ? "" : undefined}
      onKeyDown={move}
    >
      {items.map((item) => {
        const on = item.value === value;
        const forced = force?.value === item.value ? force.state : undefined;
        return (
          <button
            key={item.value}
            type="button"
            role={isTabs ? "tab" : "radio"}
            className="ds-seg-item ds-i ds-press"
            data-value={item.value}
            data-force={forced}
            disabled={item.disabled}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(item.value)}
            {...selectedAttrs(isTabs ? "selected" : "checked", on)}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
