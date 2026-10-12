"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

export interface PopItem {
  key: string;
  title: string;
  sub?: string;
  icon?: ReactNode;
  onSelect: () => void;
}

/**
 * The small RichMenu (popovers.jsx `RichMenu small`), drawn in place under
 * its trigger so it stays inside the `.needt-v3` scope without a portal.
 * //todo: swap for needt3/menu RichMenu once the T05 shell is merged.
 */
export function PopMenu({
  trigger,
  items,
  prompt,
  width = 232,
  align = "left",
  label,
}: {
  trigger: (open: boolean) => ReactNode;
  items: PopItem[];
  prompt?: string;
  width?: number;
  align?: "left" | "right";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [hot, setHot] = useState<string | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node))
        setOpen(false);
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
    <span
      ref={wrap}
      className="relative inline-flex"
      onClick={(e) => e.stopPropagation()}
    >
      <span
        className="inline-flex"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger(open)}
      </span>
      {open ? (
        <div
          role="menu"
          aria-label={label}
          className={`nx-pop${align === "right" ? " is-right" : ""}`}
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            [align === "right" ? "right" : "left"]: 0,
            zIndex: 60,
            width,
            padding: 6,
            boxSizing: "border-box",
            borderRadius: 14,
            background: "var(--surface-raised)",
            boxShadow: "var(--shadow-floating)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {prompt ? <div className="shell-rich-menu-text">{prompt}</div> : null}
          {items.map((it) => (
            <div
              key={it.key}
              role="menuitem"
              tabIndex={0}
              className="shell-small-row-menuitem"
              style={{
                background: hot === it.key ? "var(--fill-3)" : "transparent",
              }}
              onMouseEnter={() => setHot(it.key)}
              onMouseLeave={() => setHot(null)}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen(false);
                  it.onSelect();
                }
              }}
            >
              {it.icon ? (
                <span className="shell-small-row-row" aria-hidden>
                  {it.icon}
                </span>
              ) : null}
              <span className="shell-small-row-span">{it.title}</span>
              {it.sub ? (
                <span className="base-meta shell-rich-row-text-2">
                  {it.sub}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </span>
  );
}
