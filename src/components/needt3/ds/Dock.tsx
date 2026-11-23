"use client";

import type { MouseEventHandler, ReactNode } from "react";

import { type ForcedState, cx, selectedAttrs } from "./state";

export interface DockProps {
  /** Names the bar ("Main"). */
  "aria-label": string;
  className?: string;
  children: ReactNode;
}

/**
 * The bottom bar: a raised floating capsule, one raised disc per place, the
 * place you are in turned to ink. API and styles only: the live bar
 * (phone/menu/FloatBar, bottom-bar-float.css) keeps its own sheet until the
 * Menu wave swaps it in. `barStyle` stays a two-value skin of this one
 * component.
 */
export function Dock({
  className,
  children,
  "aria-label": ariaLabel,
}: DockProps) {
  return (
    <nav className={cx("ds-dock", className)} aria-label={ariaLabel}>
      {children}
    </nav>
  );
}

export interface DockItemProps {
  icon: ReactNode;
  /** The place's name: the item has no visible text. */
  label: string;
  /** Where you are: ink, and aria-current="page". */
  active?: boolean;
  disabled?: boolean;
  href?: string;
  onSelect?: () => void;
  force?: ForcedState;
  className?: string;
}

/** One place in the Dock: a link when it has an href, a button when it has not. */
export function DockItem({
  icon,
  label,
  active = false,
  disabled,
  href,
  onSelect,
  force,
  className,
}: DockItemProps) {
  const shared = {
    className: cx("ds-dock-item ds-i ds-press", className),
    "aria-label": label,
    title: label,
    "data-force": force,
    ...selectedAttrs("current", active),
  };
  if (href && !disabled) {
    const onClick: MouseEventHandler<HTMLAnchorElement> | undefined = onSelect
      ? (event) => {
          event.preventDefault();
          onSelect();
        }
      : undefined;
    return (
      <a {...shared} href={href} onClick={onClick}>
        {icon}
      </a>
    );
  }
  return (
    <button {...shared} type="button" disabled={disabled} onClick={onSelect}>
      {icon}
    </button>
  );
}
