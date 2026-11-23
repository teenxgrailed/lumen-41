"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";

import { type ForcedState, cx, selectedAttrs } from "./state";

export type IconButtonVariant = "flat" | "disc" | "ink";
export type IconButtonSize = "md" | "lg";

export interface IconButtonProps
  extends Omit<ComponentPropsWithRef<"button">, "children" | "aria-label"> {
  /** What it does, for a screen reader and the tooltip. Required: it has no text. */
  label: string;
  icon: ReactNode;
  /** flat: no ground. disc: the raised disc. ink: send, or on. */
  variant?: IconButtonVariant;
  /** md is 32 square, lg 44. */
  size?: IconButtonSize;
  /** Makes it a toggle (aria-pressed); ink when on. */
  pressed?: boolean;
  force?: ForcedState;
}

/**
 * The one round icon button: ps-mini, ps11-back, pov-icon-btn, tdc-icon-btn,
 * ha-x, kp-x, pw-x, pp-x, ptk-round, nva-round, ag-round, fc-round, sg-x,
 * cs-close, btn-icon, chat-send. Always labelled.
 */
export function IconButton({
  label,
  icon,
  variant = "flat",
  size = "md",
  pressed,
  force,
  type = "button",
  className,
  title,
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={cx("ds-icon-btn ds-i ds-press", className)}
      aria-label={label}
      title={title ?? label}
      data-variant={variant}
      data-size={size}
      data-force={force}
      {...(pressed === undefined ? null : selectedAttrs("pressed", pressed))}
    >
      {icon}
    </button>
  );
}
