"use client";

import type { ComponentPropsWithRef } from "react";

import { type ForcedState, cx, selectedAttrs } from "./state";

export type SwitchSize = "md" | "sm";

export interface SwitchProps
  extends Omit<
    ComponentPropsWithRef<"button">,
    "children" | "onChange" | "role" | "aria-checked"
  > {
  checked: boolean;
  onChange?: (next: boolean) => void;
  /** md is 50 x 30 (touch), sm is 28 x 16 (a dense desktop row). */
  size?: SwitchSize;
  force?: ForcedState;
}

/**
 * The one switch: ps / phb / ppl / pd / pov-switch, nt-switch, fc-switch,
 * mb-switch, nva-switch, sk-switch, V3Switch, PsSwitch, DocSwitch. The track
 * is a groove; the knob is the accent as a mark. Give it a name with
 * `aria-label` or `aria-labelledby`.
 */
export function Switch({
  checked,
  onChange,
  size = "md",
  force,
  type = "button",
  className,
  onClick,
  ...rest
}: SwitchProps) {
  return (
    <button
      {...rest}
      type={type}
      role="switch"
      aria-checked={checked}
      className={cx("ds-switch ds-i ds-press", className)}
      data-size={size}
      data-force={force}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onChange?.(!checked);
      }}
      {...selectedAttrs("checked", checked)}
    >
      <span className="ds-switch-knob" aria-hidden="true" />
    </button>
  );
}
