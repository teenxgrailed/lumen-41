"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { useExit } from "../ctx/useExit";

/** A menu hung under its trigger, closed by a click anywhere else. */
export function DropMenu({
  trigger,
  width,
  children,
}: {
  trigger: (open: boolean) => ReactNode;
  width: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [shown, leaving] = useExit(open, 130);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <span className="docs-drop-menu-1" ref={wrap}>
      <span className="docs-drop-menu-2" onClick={() => setOpen(!open)}>
        {trigger(open)}
      </span>
      {shown ? (
        <div
          role="menu"
          className={
            "nx-pop docs-drop-pop is-right base-menu" +
            (leaving ? " is-leaving" : "")
          }
          style={{ width }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </span>
  );
}

export function MenuRow({
  icon,
  hint,
  onClick,
  children,
  keepOpen,
}: {
  icon: ReactNode;
  hint?: ReactNode;
  onClick: () => void;
  children: ReactNode;
  keepOpen?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="menu-row"
      style={{ width: "100%", border: 0, background: "transparent" }}
      onClick={(e) => {
        if (keepOpen) e.stopPropagation();
        onClick();
      }}
    >
      <span style={{ display: "flex", width: 14 }}>{icon}</span>
      <span style={{ flex: 1, textAlign: "left" }}>{children}</span>
      {hint}
    </button>
  );
}
