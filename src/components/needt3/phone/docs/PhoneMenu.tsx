"use client";

import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";

import { PkScrim } from "../kit/Scrim";
import { pkCx } from "../kit/util";

export type PdMenuItem =
  | { sep: true }
  | { head: string }
  | {
      id?: string;
      label: string;
      icon?: ReactNode;
      /** A radio row: checked, with a check where the icon would be. */
      on?: boolean;
      /** A small node at the right (a sort arrow). */
      arrow?: ReactNode;
      arrowLabel?: string;
      tone?: "alert";
      onClick: () => void;
    };

/**
 * The ⋯ menu (phone-docs.jsx `PdMenu` 292): a frosted card dropping from the
 * top right over a scrim. Focus moves to the first row on open and goes back
 * to what had it on close; Esc closes (and only the menu hears it).
 */
export function PdMenu({
  open,
  onClose,
  items,
  label,
}: {
  open: boolean;
  onClose: () => void;
  items: PdMenuItem[];
  label: string;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const settle = useRef(0);
  const close = useRef(onClose);
  close.current = onClose;

  useLayoutEffect(() => {
    scrim.current?.style.setProperty("--pk-scrim-k", open ? "1" : "0");
  }, [open]);

  // The card is the one blur while it springs open and shut: the screen's own
  // bands rest for as long as it is out and the 0.24 s it takes to go back.
  // The host is found while the layer is attached and kept: by the time an
  // unmount cleanup runs the layer no longer is, and the flag must still go.
  const host = useRef<Element | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    const el = layer.current;
    host.current = el?.closest("[data-v2p-host]") ?? el?.parentElement ?? null;
    window.clearTimeout(settle.current);
    host.current?.toggleAttribute("data-pk-moving", true);
    return () => {
      const h = host.current;
      settle.current = window.setTimeout(
        () => h?.toggleAttribute("data-pk-moving", false),
        300
      );
    };
  }, [open]);

  // Unmounting while it is out must not leave the host marked as moving.
  useEffect(
    () => () => {
      window.clearTimeout(settle.current);
      host.current?.toggleAttribute("data-pk-moving", false);
    },
    []
  );

  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement as HTMLElement | null;
    card.current?.querySelector<HTMLElement>("button")?.focus({
      preventScroll: true,
    });
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close.current();
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      if (before && document.contains(before)) {
        before.focus({ preventScroll: true });
      }
    };
  }, [open]);

  return (
    <div
      ref={layer}
      className={pkCx("pd-menu-layer", open && "is-open")}
      data-pd-menu={open ? "open" : "shut"}
      aria-hidden={open ? undefined : "true"}
    >
      <PkScrim scrimRef={scrim} open={open} onClick={onClose} />
      <div ref={card} className="pd-menu" role="menu" aria-label={label}>
        {items.map((it, i) => {
          if ("sep" in it) {
            return (
              <span key={`s${i}`} className="pd-menu-sep" role="separator" />
            );
          }
          if ("head" in it) {
            return (
              <span key={`h${i}`} className="pd-menu-head">
                {it.head}
              </span>
            );
          }
          return (
            <button
              key={it.id ?? it.label}
              type="button"
              role={it.on != null ? "menuitemradio" : "menuitem"}
              aria-checked={it.on != null ? !!it.on : undefined}
              tabIndex={open ? 0 : -1}
              className={pkCx(
                "pd-menu-item",
                it.on && "is-on",
                it.tone === "alert" && "is-alert"
              )}
              data-pd-item={it.id ?? it.label}
              onClick={it.onClick}
            >
              <span className="pd-menu-icon">{it.icon ?? null}</span>
              <span className="pd-menu-label">{it.label}</span>
              {it.arrow ? (
                <span className="pd-menu-arrow" aria-label={it.arrowLabel}>
                  {it.arrow}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The glass round / chip over the screen's top band (`PdGlass`). */
export function PdGlass({
  icon,
  label,
  children,
  className,
  onClick,
  data,
  keepFocus,
}: {
  icon: ReactNode;
  label: string;
  children?: ReactNode;
  className?: string;
  onClick: () => void;
  data?: Record<string, string>;
  /** A press does not take the focus (Done while typing keeps the editor focused until the click). */
  keepFocus?: boolean;
}) {
  return (
    <button
      type="button"
      className={pkCx("pd-glass", children != null && "has-label", className)}
      aria-label={label}
      onClick={onClick}
      onPointerDown={keepFocus ? (e) => e.preventDefault() : undefined}
      {...(data ?? {})}
    >
      {icon}
      {children != null ? (
        <span className="pd-glass-label">{children}</span>
      ) : null}
    </button>
  );
}
