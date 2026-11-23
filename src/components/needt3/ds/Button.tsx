"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";

import { type ForcedState, cx, selectedAttrs } from "./state";

export type ButtonVariant = "primary" | "secondary" | "text";
export type ButtonSize = "md" | "lg";

export interface ButtonProps
  extends Omit<ComponentPropsWithRef<"button">, "children"> {
  /** primary: ink fill. secondary: the raised disc. text: flat. */
  variant?: ButtonVariant;
  /** md is 32 high, lg 52 (a sheet's main action, full width on a phone). */
  size?: ButtonSize;
  icon?: ReactNode;
  /** Text colour only; ignored on primary. */
  danger?: boolean;
  block?: boolean;
  /** Working: shows a spinner, ignores presses, keeps its width. */
  busy?: boolean;
  /** Makes it a toggle: aria-pressed, and ink when on. Not for primary. */
  pressed?: boolean;
  /** Draws a state a pointer cannot hold still (/admin/ds only). */
  force?: ForcedState;
  children?: ReactNode;
}

/**
 * The one button. Replaces pk-btn, ha-btn, nx-btn, pp-btn, pw-btn, hq-btn,
 * sg-btn and the shadcn Button (docs/handoff/design-system.md). 32 or 52 high
 * with a 44px hit area either way.
 */
export function Button({
  variant = "secondary",
  size = "md",
  icon,
  danger,
  block,
  busy,
  pressed,
  force,
  type = "button",
  className,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={cx("ds-btn ds-i ds-press", className)}
      data-variant={variant}
      data-size={size}
      data-danger={danger ? "" : undefined}
      data-block={block ? "" : undefined}
      data-force={force}
      aria-busy={busy || undefined}
      onClick={busy ? undefined : onClick}
      {...(pressed === undefined ? null : selectedAttrs("pressed", pressed))}
    >
      {busy ? <span className="ds-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}
