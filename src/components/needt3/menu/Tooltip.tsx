"use client";

import {
  type CSSProperties,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { noteTipHidden, tipDelay } from "./tip-timing";

export type TooltipSide =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-start"
  | "top-end";

/**
 * The design system's tooltip (`nt-tooltip`), Craft-style: it appears after a
 * hover delay, is instant when it follows a neighbour's tip closely, fades and
 * slides 120ms (transform and opacity only), and goes away on press, scroll or
 * Escape. A keyboard focus shows it at once. `keys` is the shortcut hint, set
 * right-aligned in a muted kbd. Timing lives in `tip-timing.ts`.
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
  const [open, setOpen] = useState(false);
  // Waiting or showing: the window is listened to only then.
  const [engaged, setEngaged] = useState(false);
  const openRef = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const cancel = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  const show = useCallback(
    (wait: number) => {
      cancel();
      setEngaged(true);
      if (wait <= 0) {
        openRef.current = true;
        setOpen(true);
        return;
      }
      timer.current = window.setTimeout(() => {
        openRef.current = true;
        setOpen(true);
      }, wait);
    },
    [cancel]
  );

  /** `left`: the pointer or focus moved away, so the next tip may skip the wait. */
  const hide = useCallback(
    (left: boolean) => {
      cancel();
      setEngaged(false);
      if (!openRef.current) return;
      openRef.current = false;
      setOpen(false);
      if (left) noteTipHidden(performance.now());
    },
    [cancel]
  );

  useEffect(() => cancel, [cancel]);

  // While a tip is waiting or showing, a scroll or Escape puts it away.
  useEffect(() => {
    if (!engaged) return undefined;
    const away = () => hide(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide(false);
    };
    window.addEventListener("scroll", away, true);
    window.addEventListener("wheel", away, { passive: true });
    document.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("wheel", away);
      document.removeEventListener("keydown", esc);
    };
  }, [engaged, hide]);

  const onEnter = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    show(tipDelay(performance.now()));
  };
  const onFocus = (e: FocusEvent) => {
    // Only the keyboard: a click focuses a button but must not raise its tip.
    if (e.target.matches(":focus-visible")) show(0);
  };

  return (
    <span
      className="nt-tooltip-wrap"
      data-tip-js=""
      style={style}
      onPointerEnter={onEnter}
      onPointerLeave={() => hide(true)}
      onPointerDown={() => hide(false)}
      onFocus={onFocus}
      onBlur={() => hide(true)}
    >
      {children}
      <span
        className="nt-tooltip"
        role="tooltip"
        data-side={side}
        data-open={open ? "" : undefined}
      >
        {label}
        {keys ? <kbd className="nt-tooltip-key">{keys}</kbd> : null}
      </span>
    </span>
  );
}
