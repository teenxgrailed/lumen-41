"use client";

import type { MouseEventHandler, ReactNode } from "react";

import { type ForcedState, type Tone, cx, selectedAttrs } from "./state";

export type ChipVariant = "disc" | "wash" | "empty";
export type ChipSize = "sm" | "md";

export interface ChipProps {
  /** disc: raised (the default). wash: flat, for tags and badges. empty: dashed, "+ add". */
  variant?: ChipVariant;
  /** sm is 24 high, md 32. */
  size?: ChipSize;
  icon?: ReactNode;
  /** A chosen chip is ink. Only on a chip you can press. */
  on?: boolean;
  /** A hue wash at 12 %, and nothing stronger. Only on `wash`. */
  tone?: Tone;
  /** Shows a remove button after the label. The body is then not pressable. */
  onRemove?: () => void;
  removeLabel?: string;
  /** A chip with a handler is a button, one without is a span (a badge, a tag). */
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  force?: ForcedState;
  className?: string;
  children?: ReactNode;
  "aria-label"?: string;
}

/**
 * The one chip. It is also the pill, the badge and the tag: the 17 chip bases
 * and the 11 "small label with a wash" classes of the inventory.
 */
export function Chip({
  variant = "disc",
  size = "sm",
  icon,
  on,
  tone,
  onRemove,
  removeLabel = "Remove",
  onClick,
  disabled,
  force,
  className,
  children,
  "aria-label": ariaLabel,
}: ChipProps) {
  const label = <span className="ds-chip-label">{children}</span>;
  const common = {
    className: cx("ds-chip", className),
    "data-variant": variant,
    "data-size": size,
    "data-tone": variant === "wash" ? tone : undefined,
    "aria-label": ariaLabel,
  };
  if (onRemove) {
    // a tag you can take off: the body is text, the x is the button
    return (
      <span {...common} role="group">
        {icon ? <span className="ds-chip-icon">{icon}</span> : null}
        {label}
        <button
          type="button"
          className="ds-chip-x ds-i ds-press"
          aria-label={removeLabel}
          onClick={onRemove}
          disabled={disabled}
          data-force={force}
        >
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path
              d="M1.5 1.5l7 7m0-7l-7 7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </button>
      </span>
    );
  }
  if (!onClick) {
    return (
      <span {...common}>
        {icon ? <span className="ds-chip-icon">{icon}</span> : null}
        {label}
      </span>
    );
  }
  return (
    <button
      {...common}
      type="button"
      className={cx(common.className, "ds-i ds-press")}
      onClick={onClick}
      disabled={disabled}
      data-force={force}
      {...(on === undefined ? null : selectedAttrs("pressed", on))}
    >
      {icon ? <span className="ds-chip-icon">{icon}</span> : null}
      {label}
    </button>
  );
}
