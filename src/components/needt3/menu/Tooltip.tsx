import type { CSSProperties, ReactNode } from "react";

export type TooltipSide =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-start"
  | "top-end";

/**
 * The design system's CSS tooltip (`nt-tooltip`): shown on hover and focus,
 * no portal, no timers. Ported from the DS bundle's Tooltip.
 */
export function Tooltip({
  label,
  keys,
  side = "top",
  style,
  children,
}: {
  label: ReactNode;
  keys?: string;
  side?: TooltipSide;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <span className="nt-tooltip-wrap" style={style}>
      {children}
      <span className="nt-tooltip" role="tooltip" data-side={side}>
        {label}
        {keys ? <span className="nt-tooltip-key">{keys}</span> : null}
      </span>
    </span>
  );
}
