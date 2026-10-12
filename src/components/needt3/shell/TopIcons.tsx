"use client";

import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";

import { createPortal } from "react-dom";
import {
  LuBell,
  LuCircleHelp,
  LuKeyboard,
  LuSparkles,
  LuX,
} from "react-icons/lu";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { Sheet } from "../ctx/Sheet";
import { useExit } from "../ctx/useExit";
import { Art, type ArtName } from "../menu/Art";
import { Tooltip } from "../menu/Tooltip";
import { useShellApi } from "./ShellContext";

/* Background only when open, so .tb-icon:hover can show through. */
const iconBtn = (on: boolean): CSSProperties => ({
  position: "relative",
  width: 32,
  height: 32,
  display: "grid",
  placeItems: "center",
  padding: 0,
  border: 0,
  borderRadius: 10,
  cursor: "default",
  background: on ? "var(--fill-4)" : undefined,
  color: "var(--text-primary)",
  transition: "background-color 140ms ease",
});
const panelBox: CSSProperties = {
  position: "fixed",
  zIndex: 1100,
  boxSizing: "border-box",
  borderRadius: 20,
  background: "var(--surface-raised)",
  boxShadow: "var(--shadow-floating)",
  transformOrigin: "top right",
};

function Dot({ show }: { show: boolean }) {
  return (
    <span
      className="shell-dot-layer"
      aria-hidden="true"
      style={{ transform: show ? "scale(1)" : "scale(0)" }}
    />
  );
}

/** Craft's segmented control: a white thumb slides between. */
function Seg2({
  value,
  options,
  onChange,
}: {
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  const i = options.findIndex((o) => o[0] === value);
  return (
    <div
      className="shell-seg2-grid"
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
    >
      <span
        className="shell-seg2-layer"
        aria-hidden="true"
        style={{
          width: `calc((100% - 6px) / ${options.length})`,
          transform: `translateX(${i * 100}%)`,
        }}
      />
      {options.map(([id, l]) => (
        <button
          key={id}
          type="button"
          className="tb-seg shell-seg2-seg"
          onClick={() => onChange(id)}
          aria-pressed={value === id}
          style={{
            font:
              value === id
                ? "500 13px/18px var(--font-sans)"
                : "400 13px/18px var(--font-sans)",
            color:
              value === id ? "var(--text-primary)" : "var(--text-tertiary)",
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function EmptyNotes({ title, text }: { title: string; text: string }) {
  return (
    <div className="nx-swap shell-empty-notes-swap">
      <div className="shell-empty-notes-stack">
        {[0, 1, 2].map((k) => (
          <div
            className="nx-swap shell-empty-notes-row"
            key={k}
            style={{
              animationDuration: "280ms",
              animationDelay: `${80 + k * 60}ms`,
            }}
          >
            <span className="shell-empty-notes-bar" />
            <span className="shell-empty-notes-stack-2">
              <span className="shell-empty-notes-bar-2" />
              <span className="shell-empty-notes-bar-3" />
            </span>
          </div>
        ))}
      </div>
      <span className="shell-empty-notes-text">{title}</span>
      <span className="shell-empty-notes-text-2">{text}</span>
    </div>
  );
}

/**
 * The bell. //todo: Activity and Reminders need a read-only feed
 * (`/api/notifications` marks rows delivered on read, so the bell must not
 * call it); until one exists both tabs show their empty state.
 */
function NotesPanel() {
  const [tab, setTab] = useState("activity");
  return (
    <div className="shell-notes-panel-stack">
      <header className="shell-notes-panel-row">
        <span className="shell-notes-panel-text">Notifications</span>
      </header>
      <Seg2
        value={tab}
        onChange={setTab}
        options={[
          ["activity", "Activity"],
          ["reminders", "Reminders"],
        ]}
      />
      <div key={tab} className="nx-swap shell-notes-panel-swap">
        {tab === "activity" ? (
          <EmptyNotes
            title="No notifications yet"
            text="You'll be notified here when someone mentions you, comments on your page or Needt moves your day."
          />
        ) : (
          <EmptyNotes
            title="No reminders"
            text="Reminders you set on tasks and events will wait here."
          />
        )}
      </div>
    </div>
  );
}

const NEWS: [ArtName, string, string][] = [
  [
    "home",
    "Home is a page",
    "Your day as a Daily Note: habits on one line, tasks written into the page.",
  ],
  ["mail", "Mailbox", "Every message can become a task in one click."],
  [
    "work",
    "Customize the sidebar",
    "Pick your tiles, hide the rest in More, drag to reorder.",
  ],
  ["template", "Right click everywhere", "Pin, open and hide — with Undo."],
];

export function WhatsNew({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="What's new in Needt"
      scrimClassName="base-scrim nx-scrim"
      className="shell-whats-new-stack nx-sheet"
    >
      <header className="shell-whats-new-row">
        <span className="base-stack">
          <span className="shell-whats-new-text">What&apos;s new in Needt</span>
          <span className="base-meta">6 October 2026</span>
        </span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="nx-press base-close shell-sidebar-toggle-text"
        >
          <LuX size={13} />
        </button>
      </header>
      {NEWS.map(([art, t, s], k) => (
        <div
          className="nx-swap shell-whats-new-row-2"
          key={t}
          style={{
            animationDuration: "260ms",
            animationDelay: `${80 + k * 50}ms`,
          }}
        >
          <Art name={art} size={40} />
          <span className="base-stack shell-day-menu-span">
            <span className="shell-whats-new-text-2">{t}</span>
            <span className="shell-notes-panel-text-3">{s}</span>
          </span>
        </div>
      ))}
      <button
        type="button"
        className="nx-btn nx-btn-primary shell-whats-new-btn"
        onClick={onClose}
      >
        Got it
      </button>
    </Sheet>
  );
}

const SEEN_KEY = "needt3.whatsNew.seen";
const NEWS_ID = "2026-10-06";

function readSeen() {
  try {
    return window.localStorage.getItem(SEEN_KEY) === NEWS_ID;
  } catch {
    return true;
  }
}

/** A panel anchored under its trigger's right edge. */
function useAnchored(open: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<{ right: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setAt({ right: window.innerWidth - r.right, top: r.bottom + 8 });
  }, [open]);
  return [ref, at] as const;
}

/** Top right on every screen: the bell and the help mark. */
export function TopIcons() {
  const shell = useShellApi();
  const container = useV3PortalContainer();
  const [which, setWhich] = useState<"bell" | "help" | null>(null);
  const [seenNew, setSeenNew] = useState(true);
  const [bellRef, bellAt] = useAnchored(which === "bell");
  const [helpRef, helpAt] = useAnchored(which === "help");
  const panel = useRef<HTMLDivElement>(null);
  const [shownBell, leavingBell] = useExit(which === "bell", 130);
  const [shownHelp, leavingHelp] = useExit(which === "help", 130);

  useLayoutEffect(() => setSeenNew(readSeen()), []);
  useLayoutEffect(() => {
    if (!which) return undefined;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if ([bellRef, helpRef, panel].every((r) => !r.current?.contains(t)))
        setWhich(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setWhich(null);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [which, bellRef, helpRef]);

  const openNews = () => {
    setWhich(null);
    setSeenNew(true);
    try {
      window.localStorage.setItem(SEEN_KEY, NEWS_ID);
    } catch {
      /* storage blocked: the dot comes back next visit */
    }
    shell.openWhatsNew();
  };

  const help: [React.ReactNode, string, () => void, boolean, string?][] = [
    [<LuSparkles key="i" size={15} />, "What's new", openNews, !seenNew],
    [
      <LuKeyboard key="i" size={15} />,
      "Keyboard shortcuts",
      () => {
        setWhich(null);
        shell.openKeys();
      },
      false,
      "?",
    ],
  ];

  const bell = (
    <button
      type="button"
      aria-label="Notifications"
      aria-expanded={which === "bell"}
      className="nx-press tb-icon"
      onClick={() => setWhich(which === "bell" ? null : "bell")}
      style={iconBtn(which === "bell")}
    >
      <LuBell size={18} />
      <Dot show={false} />
    </button>
  );
  const helpBtn = (
    <button
      type="button"
      aria-label="Help"
      aria-expanded={which === "help"}
      className="nx-press tb-icon"
      onClick={() => setWhich(which === "help" ? null : "help")}
      style={iconBtn(which === "help")}
    >
      <LuCircleHelp size={18} />
      <Dot show={!seenNew} />
    </button>
  );

  return (
    <span className="shell-top-icons-row">
      <span className="shell-sidebar-drop" ref={bellRef}>
        {which ? (
          bell
        ) : (
          <Tooltip label="Notifications" side="bottom">
            {bell}
          </Tooltip>
        )}
      </span>
      <span className="shell-sidebar-drop" ref={helpRef}>
        {which ? (
          helpBtn
        ) : (
          <Tooltip label="Help" side="bottom">
            {helpBtn}
          </Tooltip>
        )}
      </span>
      {shownBell && bellAt && container
        ? createPortal(
            <div
              ref={panel}
              className={`nx-pop is-right${leavingBell ? " is-leaving" : ""}`}
              style={{ width: 360, padding: 16, ...panelBox, ...bellAt }}
            >
              <NotesPanel />
            </div>,
            container
          )
        : null}
      {shownHelp && helpAt && container
        ? createPortal(
            <div
              ref={panel}
              role="menu"
              className={`nx-pop is-right${leavingHelp ? " is-leaving" : ""}`}
              style={{
                width: 260,
                padding: 6,
                ...panelBox,
                borderRadius: 14,
                ...helpAt,
              }}
            >
              {help.map(([icon, label, run, dot, kbd], k) => (
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  className="nx-swap sk-row shell-top-icons-sk-row"
                  onClick={run}
                  style={{
                    animationDuration: "220ms",
                    animationDelay: `${k * 22}ms`,
                  }}
                >
                  <span className="shell-notes-panel-row-2">{icon}</span>
                  {label}
                  {dot ? <span className="shell-top-icons-bar" /> : null}
                  {kbd ? (
                    <span className="base-meta shell-sidebar-toggle-text">
                      {kbd}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>,
            container
          )
        : null}
    </span>
  );
}
