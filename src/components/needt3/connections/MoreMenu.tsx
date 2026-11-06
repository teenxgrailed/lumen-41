"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { createPortal } from "react-dom";
import { FiMoreHorizontal } from "react-icons/fi";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { useExit } from "../ctx/useExit";

/**
 * Puts the focus back on the first of `selectors` still on the page, after
 * the frame in which a sheet closed or a row went away: the "…" that opened
 * a confirm, or the nearest thing left when that row is gone.
 */
export function refocus(...selectors: string[]) {
  const go = () => {
    for (const sel of selectors) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el) return void el.focus();
    }
  };
  if (typeof window.requestAnimationFrame === "function")
    window.requestAnimationFrame(go);
  else go();
}

/** The floating Ask Needt pill's top edge, when it is on screen. */
function dockTop(): number | null {
  const r = document
    .querySelector<HTMLElement>("[data-chat-pill]")
    ?.getBoundingClientRect();
  return r && r.height > 0 ? r.top : null;
}

export interface MoreMenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  danger?: boolean;
  /** Data attributes for the row (tests and analytics read them). */
  attrs?: Record<string, string>;
  run: () => void;
}

/**
 * "…" on a connected card or app row. The menu is portalled under its trigger
 * (a glass card is its own stacking context, so a menu inside it would sit
 * under the cards below) and flips up near the bottom edge. Keyboard: opening
 * it moves focus to the first row, arrows move between rows, Escape and Tab
 * close it and give focus back to the trigger.
 */
export function MoreMenu({
  label,
  id,
  items,
}: {
  /** "Options for Gmail". */
  label: string;
  /** Written to `data-cn-more` / `data-cn-menu`. */
  id: string;
  items: readonly MoreMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  /** Which row takes the focus on open: ArrowUp opens at the last. */
  const [from, setFrom] = useState<"first" | "last">("first");
  const [at, setAt] = useState<{
    right: number;
    top: number;
    flip: boolean;
  } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const container = useV3PortalContainer();
  const [shown, leaving] = useExit(open, 130);
  const rows = items.length;
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const h = 12 + 34 * rows;
    // The floor is the window's edge or the Ask Needt pill above it, so a
    // menu opened just over the dock flips up instead of going under it.
    const pill = dockTop();
    const floor = Math.min(
      window.innerHeight - 8,
      pill === null ? Infinity : pill - 8
    );
    setAt(
      r.bottom + 6 + h > floor
        ? { right: window.innerWidth - r.right, top: r.top - 6 - h, flip: true }
        : { right: window.innerWidth - r.right, top: r.bottom + 6, flip: false }
    );
  }, [open, rows]);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !pop.current?.contains(t))
        setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  // Focus the first row (or the last, opened with ArrowUp) once placed.
  useEffect(() => {
    if (!open || !at) return;
    const rowsEls =
      pop.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [];
    rowsEls[from === "last" ? rowsEls.length - 1 : 0]?.focus();
  }, [open, at, from]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    const rowsEls = Array.from(
      pop.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    );
    const i = rowsEls.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      rowsEls[(i + step + rowsEls.length) % rowsEls.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      rowsEls[e.key === "Home" ? 0 : rowsEls.length - 1]?.focus();
    }
  };

  return (
    <span className="cn-card-text">
      <button
        ref={btn}
        type="button"
        className="cn-iconbtn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        data-cn-more={id}
        onClick={() => {
          setFrom("first");
          setOpen(!open);
        }}
        onKeyDown={(e) => {
          if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) {
            e.preventDefault();
            setFrom(e.key === "ArrowUp" ? "last" : "first");
            setOpen(true);
          }
        }}
      >
        <FiMoreHorizontal size={16} aria-hidden />
      </button>
      {shown && at && container
        ? createPortal(
            <div
              ref={pop}
              role="menu"
              aria-label={label}
              className={
                "nx-pop is-right cn-menu-box" + (leaving ? " is-leaving" : "")
              }
              data-cn-menu={id}
              onKeyDown={onKey}
              style={{
                transformOrigin: at.flip ? "bottom right" : "top right",
                right: at.right,
                top: at.top,
              }}
            >
              {items.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className={"cn-mi" + (it.danger ? " is-danger" : "")}
                  {...it.attrs}
                  onClick={() => {
                    // The trigger holds the focus while what the row opens
                    // (a confirm) takes it; the confirm gives it back.
                    close(true);
                    it.run();
                  }}
                >
                  <span className="cn-menu-row">{it.icon}</span>
                  {it.label}
                </button>
              ))}
            </div>,
            container
          )
        : null}
    </span>
  );
}
