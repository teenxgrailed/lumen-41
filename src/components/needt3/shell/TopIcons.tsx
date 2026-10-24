"use client";

import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { createPortal } from "react-dom";
import {
  LuBell,
  LuBellOff,
  LuBug,
  LuCircleHelp,
  LuEllipsis,
  LuKeyboard,
  LuRefreshCw,
  LuSettings,
  LuSparkles,
  LuX,
} from "react-icons/lu";

import { isToday, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import {
  type FeedItem,
  fetchEarlier,
  useMarkNotificationsRead,
  useNotificationFeed,
} from "@/lib/needt3/hooks/notifications";
import { useWhatsNewUnseen } from "@/lib/needt3/hooks/whats-new";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { agoLabel, safeHref } from "../corner/nudge-tip";
import { useV3PortalContainer } from "../ctx/PortalScope";
import { Sheet } from "../ctx/Sheet";
import { useExit } from "../ctx/useExit";
import { Art } from "../menu/Art";
import { Tooltip } from "../menu/Tooltip";
import { Avatar, initialsOf } from "./Avatar";
import { useShellApi } from "./ShellContext";
import { WhatsNewList, dayLabel, useWhatsNewOpening } from "./WhatsNewList";
import { artFor, splitLead, whenLabel } from "./notes-format";

const LOG_SOURCE = "v3-notes-panel";

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
 * The bell: a read-only feed from `/api/notifications?feed=1` (see
 * src/services/notifications/feed.ts for what feeds it). Activity is what
 * happened; Reminders is what is about to. Pressing an activity row marks it
 * read and goes to what it is about; "…" marks all read, reloads, or opens
 * Settings → Notifications.
 */
export function NotesPanel({ close }: { close: () => void }) {
  const router = useRouter();
  const [tab, setTab] = useState("activity");
  const [more, setMore] = useState(false);
  const feed = useNotificationFeed("activity");
  const reminders = useNotificationFeed("reminders", tab === "reminders");
  const markRead = useMarkNotificationsRead();
  const [earlier, setEarlier] = useState<FeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const notes = [...(feed.data?.items ?? []), ...earlier];
  const next = cursor === undefined ? (feed.data?.nextBefore ?? null) : cursor;
  const now = newDate();
  const showEarlier = async () => {
    if (!next) return;
    try {
      const page = await fetchEarlier(next);
      setEarlier((l) => l.concat(page.items));
      setCursor(page.nextBefore);
    } catch (error) {
      logger.warn(
        "Could not load earlier notifications",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
    }
  };
  const options: [React.ReactNode, string, () => void][] = [
    [
      <LuBellOff key="i" size={15} />,
      "Mark all as read",
      () => void markRead("all"),
    ],
    [
      <LuRefreshCw key="i" size={15} />,
      "Reload notifications",
      () => {
        setEarlier([]);
        setCursor(undefined);
        void feed.refetch();
        if (tab === "reminders") void reminders.refetch();
      },
    ],
    [
      <LuSettings key="i" size={15} />,
      "Notification settings",
      () => {
        close();
        useNeedt3Ui.getState().openSettings("alerts");
      },
    ],
  ];
  return (
    <div className="shell-notes-panel-stack">
      <header className="shell-notes-panel-row">
        <span className="shell-notes-panel-text">Notifications</span>
        <button
          type="button"
          aria-label="Notification options"
          aria-expanded={more}
          className="tb-icon"
          onClick={() => setMore(!more)}
          style={{ ...iconBtn(more), marginLeft: "auto" }}
        >
          <LuEllipsis size={16} />
        </button>
        {more ? (
          <div className="nx-pop is-right shell-notes-panel-pop" role="menu">
            {options.map(([icon, label, run], k) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                className="nx-swap sk-row shell-notes-panel-sk-row"
                onClick={() => {
                  setMore(false);
                  run();
                }}
                style={{
                  animationDuration: "200ms",
                  animationDelay: `${k * 25}ms`,
                }}
              >
                <span className="shell-notes-panel-row-2">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </header>
      <Seg2
        value={tab}
        onChange={(v) => {
          setTab(v);
          setMore(false);
        }}
        options={[
          ["activity", "Activity"],
          ["reminders", "Reminders"],
        ]}
      />
      <div key={tab} className="nx-swap shell-notes-panel-swap">
        {tab === "activity" ? (
          notes.length ? (
            <>
              {notes.map((n, k) => {
                const { lead, rest } = splitLead(n);
                return (
                  <button
                    key={n.key}
                    type="button"
                    data-kind={n.kind}
                    data-unread={n.unread ? "true" : "false"}
                    className="nx-swap sk-row shell-notes-panel-sk-row-2"
                    style={{
                      animationDelay: `${Math.min(k, 12) * 35}ms`,
                      textAlign: "left",
                    }}
                    onClick={() => {
                      if (n.unread) void markRead([n.key]);
                      close();
                      router.push(safeHref(n.link));
                    }}
                  >
                    {n.actor ? (
                      <Avatar
                        initials={initialsOf(n.actor)}
                        name={n.actor}
                        size={28}
                      />
                    ) : (
                      <Art name={artFor(n.kind)} size={28} />
                    )}
                    <span className="shell-notes-panel-stack-2">
                      <span className="shell-notes-panel-text-2">
                        {lead ? (
                          <b className="shell-notes-panel-b">{lead}</b>
                        ) : null}
                        {rest}
                      </span>
                      {n.body ? (
                        <span className="shell-notes-panel-text-3">
                          {n.body}
                        </span>
                      ) : null}
                      <span className="base-meta">
                        {agoLabel(newDate(n.at).getTime(), now.getTime())}
                      </span>
                    </span>
                    <span
                      className="shell-notes-panel-span"
                      aria-hidden="true"
                      data-unread-dot={n.unread ? "true" : "false"}
                      style={{ transform: n.unread ? "scale(1)" : "scale(0)" }}
                    />
                  </button>
                );
              })}
              {next ? (
                <button
                  type="button"
                  className="nx-btn nx-btn-ghost shell-notes-panel-btn"
                  onClick={() => void showEarlier()}
                >
                  Show earlier
                </button>
              ) : null}
            </>
          ) : (
            <EmptyNotes
              title="No notifications yet"
              text="You'll be notified here when Needt moves your day, finds free time or sees something about to slip."
            />
          )
        ) : reminders.data?.items.length ? (
          <>
            <span className="shell-notes-panel-span-2">Coming up</span>
            {reminders.data.items.map((r, k) => (
              <button
                key={r.key}
                type="button"
                data-kind={r.kind}
                className="nx-swap sk-row shell-notes-panel-sk-row-3"
                style={{
                  animationDuration: "220ms",
                  animationDelay: `${Math.min(k, 12) * 30}ms`,
                  textAlign: "left",
                }}
                onClick={() => {
                  close();
                  router.push(safeHref(r.link));
                }}
              >
                <span className="base-stack shell-notes-panel-stack-3">
                  <span className="shell-notes-panel-text-5">{r.title}</span>
                  <span
                    className="shell-notes-panel-text-6"
                    style={{
                      color:
                        r.kind === "due" && newDate(r.at) < now
                          ? "var(--destructive)"
                          : isToday(newDate(r.at))
                            ? "var(--accent)"
                            : "var(--text-tertiary)",
                    }}
                  >
                    {whenLabel(r, now)}
                  </span>
                </span>
              </button>
            ))}
          </>
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

/**
 * What's new: the changelog fragments, newest day first (`/api/whats-new`).
 * Opening it records the newest day as seen, which clears the dot on the
 * account avatar and in the help menu.
 */
export function WhatsNew({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const feed = useWhatsNewOpening(open);
  const newest = feed.data?.groups.find((g) => g.date)?.date ?? null;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="What's new in Needt"
      scrimClassName="base-scrim nx-scrim"
      className="shell-whats-new-stack nx-sheet wn-sheet"
    >
      <header className="shell-whats-new-row">
        <span className="base-stack">
          <span className="shell-whats-new-text">What&apos;s new in Needt</span>
          {newest ? (
            <span className="base-meta">Updated {dayLabel(newest)}</span>
          ) : null}
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
      <div className="scroll-inner wn-scroll">
        <WhatsNewList {...feed} />
      </div>
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
  const unreadCount = useNotificationFeed("activity").data?.unreadCount ?? 0;
  const unread = unreadCount > 0;
  const container = useV3PortalContainer();
  const [which, setWhich] = useState<"bell" | "help" | null>(null);
  const unseenNews = useWhatsNewUnseen();
  const [bellRef, bellAt] = useAnchored(which === "bell");
  const [helpRef, helpAt] = useAnchored(which === "help");
  const panel = useRef<HTMLDivElement>(null);
  const [shownBell, leavingBell] = useExit(which === "bell", 130);
  const [shownHelp, leavingHelp] = useExit(which === "help", 130);

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
    shell.openWhatsNew();
  };

  /* The prototype's menu (topbar.jsx TB_HELP) also has Send feedback,
     Frequently asked questions and Markdown shortcuts. The prototype only
     toasts "opens in the browser" for them; there is no page or route behind
     any of the three yet, so they are not drawn. //todo: add them in the
     prototype's order (feedback first, FAQ after What's new, Markdown last)
     once the pages exist. */
  const help: [React.ReactNode, string, () => void, boolean, string?][] = [
    [<LuSparkles key="i" size={15} />, "What's new", openNews, unseenNews],
    [
      <LuBug key="i" size={15} />,
      "Report a problem",
      () => {
        setWhich(null);
        shell.openBug();
      },
      false,
    ],
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
      aria-label={
        unread ? `Notifications, ${unreadCount} unread` : "Notifications"
      }
      aria-expanded={which === "bell"}
      className="nx-press tb-icon"
      onClick={() => setWhich(which === "bell" ? null : "bell")}
      style={iconBtn(which === "bell")}
    >
      <LuBell size={18} />
      <Dot show={unread} />
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
      <Dot show={unseenNews} />
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
              <NotesPanel close={() => setWhich(null)} />
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
