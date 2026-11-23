"use client";

import type { ReactNode } from "react";

import { type ForcedState, cx, selectedAttrs } from "./state";

export type RowVariant = "plain" | "grouped" | "nav";
export type RowSize = "md" | "lg";

export interface RowProps {
  /** plain: rounded, alone. grouped: inside a Surface, hairlines between. nav: opens somewhere (chevron). */
  variant?: RowVariant;
  /** md is 52 high, lg 64 (a task row). */
  size?: RowSize;
  /** A Tile, a check, a glyph. */
  lead?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  /** A value, a Switch, a Chip. Not on a pressable row: a button cannot hold one. */
  trail?: ReactNode;
  /** Makes the row a button. */
  onPress?: () => void;
  /** Makes the row a link. */
  href?: string;
  disabled?: boolean;
  /** The row you are on (aria-current="page"). */
  current?: boolean;
  force?: ForcedState;
  className?: string;
}

function Chevron() {
  return (
    <svg className="ds-row-chev" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M6 3.5L10.5 8 6 12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The one list row: pk-row, ps-row, ppl-row, hq-row, gl-row, ml-row, nav-row,
 * menu-row, cmp-row, sb-row. The title is the phone's 16, the meta the
 * chrome's 12. A row with `onPress` or `href` is a button or a link (and has
 * the press fill); without either it is a plain block.
 */
export function Row({
  variant = "plain",
  size = "md",
  lead,
  title,
  meta,
  trail,
  onPress,
  href,
  disabled,
  current,
  force,
  className,
}: RowProps) {
  const pressable = !!onPress || !!href;
  const body = (
    <>
      {lead ? <span className="ds-row-lead">{lead}</span> : null}
      <span className="ds-row-main">
        <span className="ds-row-title">{title}</span>
        {meta ? <span className="ds-row-meta">{meta}</span> : null}
      </span>
      {trail || variant === "nav" ? (
        <span className="ds-row-trail">
          {trail}
          {variant === "nav" ? <Chevron /> : null}
        </span>
      ) : null}
    </>
  );
  const shared = {
    className: cx("ds-row", pressable && "ds-i", className),
    "data-variant": variant,
    "data-size": size,
    "data-force": force,
    ...(current === undefined ? null : selectedAttrs("current", current)),
  };
  if (href && !disabled)
    return (
      <a {...shared} href={href}>
        {body}
      </a>
    );
  if (pressable)
    return (
      <button {...shared} type="button" disabled={disabled} onClick={onPress}>
        {body}
      </button>
    );
  return <div {...shared}>{body}</div>;
}
