"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

import { LuArrowRight, LuChevronDown, LuPanelLeft } from "react-icons/lu";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { useExit } from "../ctx/useExit";
import { Tooltip } from "../menu/Tooltip";
import { useShellApi } from "./ShellContext";
import { TopIcons } from "./TopIcons";

const btn: CSSProperties = {
  height: 30,
  border: 0,
  background: "transparent",
  color: "var(--text-secondary)",
  cursor: "default",
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
};

/** Top-left: the icon toggles the rail, the chevron opens the small menu. */
function SidebarToggle() {
  const shell = useShellApi();
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
  const rows: [string, string, () => void][] = [
    [
      shell.focusMode ? "Exit Focus Mode" : "Enable Focus Mode",
      "⌘.",
      () => shell.setFocusMode(!shell.focusMode),
    ],
    ["Customize Sidebar", "", shell.openCustomize],
  ];
  return (
    <span
      className="shell-sidebar-toggle-row"
      ref={wrap}
      style={{ background: open ? "var(--fill-3)" : "transparent" }}
    >
      <Tooltip label={"Toggle sidebar visibility • ⌘\\"} side="right">
        <button
          type="button"
          className="nx-press"
          aria-label="Toggle sidebar"
          onClick={shell.toggleSidebar}
          style={{ width: 30, ...btn }}
        >
          <LuPanelLeft size={18} />
        </button>
      </Tooltip>
      <button
        type="button"
        aria-label="Sidebar options"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
        style={{ width: 18, ...btn }}
      >
        <span
          className="shell-sidebar-toggle-row-2"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        >
          <LuChevronDown size={13} />
        </span>
      </button>
      {shown ? (
        <div
          role="menu"
          className={`shell-sidebar-toggle-menu nx-pop${leaving ? " is-leaving" : ""}`}
        >
          {rows.map(([label, kbd, run], i) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                run();
              }}
              className="nx-swap sk-row shell-sidebar-toggle-sk-row"
              style={{
                animationDuration: "220ms",
                animationDelay: `${30 + i * 25}ms`,
              }}
            >
              {label}
              <span className="base-meta-muted shell-sidebar-toggle-text">
                {kbd}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}

/** The design system's CommandBar: the search in the middle of the bar. */
function CommandBar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="command-bar"
      onClick={onClick}
      aria-label="Open anything"
      aria-keyshortcuts="Meta+K"
      style={{
        width: "100%",
        border: 0,
        cursor: "default",
        justifyContent: "space-between",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <LuArrowRight size={16} />
        <span style={{ font: "var(--type-ui)" }}>Open</span>
      </span>
      <span
        style={{
          font: "var(--type-meta)",
          color: "var(--text-muted)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        ⌘K
      </span>
    </button>
  );
}

/**
 * Craft's top bar across the whole window: the sidebar toggle, search in
 * the middle, notifications and help. Three flex parts, so the sides never
 * shrink below their controls and the search stays centred.
 */
export function Topbar() {
  const setPaletteOpen = useNeedt3Ui((s) => s.setPaletteOpen);
  return (
    <nav className="tab-bar shell-tab-bar-tab-bar" aria-label="Top bar">
      <span className="shell-tab-bar-row">
        <SidebarToggle />
      </span>
      <span className="shell-tab-bar-span">
        <CommandBar onClick={() => setPaletteOpen(true)} />
      </span>
      <span className="base-row shell-tab-bar-row-2">
        {/* //todo: StOfflineIndicator (S4 states) mounts here. */}
        <TopIcons />
      </span>
    </nav>
  );
}
