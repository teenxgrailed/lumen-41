"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { createPortal } from "react-dom";

import { NEUTRAL_MARK, type ProjectLike } from "@/lib/needt3/derive";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { useExit } from "../ctx/useExit";
import { taskView } from "../task/view";
import { type CalItem, type CalTimed, canEditEvent } from "./blocks";
import { c2End, c2Time } from "./layout";

/** nx-pop's exit runs 130ms; useExit must match it (MOTION V-D18). */
export const POP_EXIT_MS = 130;
const PEEK_W = 272;
const POP_W = 280;

export interface Anchor {
  top: number;
  left: number;
  right: number;
}

export const anchorOf = (el: Element): Anchor => {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, right: r.right };
};

/** Beside the anchor, flipped to its other side near the window's edge. */
function sideOf(rect: Anchor, w: number) {
  const right = rect.right + 8 + w <= window.innerWidth - 8;
  return {
    right,
    left: right ? rect.right + 8 : Math.max(8, rect.left - 8 - w),
  };
}

const c2Range = (b: { at: number | null; len: number }) =>
  b.at == null ? "All day" : `${c2Time(b.at)}–${c2Time(b.at + b.len / 60)}`;

/* ---------- peek ---------- */

export interface PeekProps {
  b: CalItem;
  rect: Anchor;
  leaving: boolean;
  projects?: readonly ProjectLike[];
  today: string;
  onEnter: () => void;
  onLeave: () => void;
  onOpen?: (id: string) => void;
  onDone: (b: CalItem) => void;
  onRename: (b: CalItem, title: string) => void;
  onDelete: (b: CalItem) => void;
  onClose: () => void;
}

/** The block's whole story beside it ($P/calendar2.jsx `C2Peek`). */
export function Peek({
  b,
  rect,
  leaving,
  projects,
  today,
  onEnter,
  onLeave,
  onOpen,
  onDone,
  onRename,
  onDelete,
  onClose,
}: PeekProps) {
  const container = useV3PortalContainer();
  const ref = useRef<HTMLDivElement>(null);
  const [y, setY] = useState(rect.top);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(b.title);
  useEffect(() => setVal(b.title), [b.title]);
  const { right, left } = sideOf(rect, PEEK_W);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setY(
      Math.max(8, Math.min(rect.top, window.innerHeight - el.offsetHeight - 8))
    );
  }, [rect.top, editing, b.id]);
  if (!container) return null;
  // same labels as the block it opens from: one mapping, taskView
  const v = taskView(b.entry, projects, today);
  const hue = v.event ? "var(--text-tertiary)" : v.hue || NEUTRAL_MARK.color;
  const where = v.event ? v.calendarName : v.projectName || "Inbox";
  const commit = () => {
    const t = val.trim();
    setEditing(false);
    if (t && t !== b.title) onRename(b, t);
    else setVal(b.title);
  };
  return createPortal(
    <div
      ref={ref}
      data-c2-peek={b.id}
      role="dialog"
      aria-label={b.title}
      className={`nx-pop c2-peek${right ? "" : " is-right"}${leaving ? " is-leaving" : ""}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ left, top: y, width: PEEK_W }}
    >
      {editing ? (
        <input
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          aria-label="Event title"
          data-c2-edit="1"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setVal(b.title);
              setEditing(false);
            }
          }}
          onBlur={commit}
          className="c2-peek-input"
        />
      ) : (
        <div
          data-c2-peek-title="1"
          className={`c2-peek-title${b.done ? " is-done" : ""}`}
        >
          {b.title}
        </div>
      )}
      <div className="c2-peek-time">
        {c2Range(b)} · {v.durLong}
      </div>
      <div className="c2-peek-where">
        <span
          aria-hidden="true"
          className="c2-peek-dot"
          style={{ background: hue }}
        />
        {where}
      </div>
      <div className="c2-peek-acts">
        {b.event ? (
          // only the person's own, non-recurring local event is editable;
          // synced and recurring events and busy blocks get no actions
          canEditEvent(b) ? (
            <>
              <button
                type="button"
                className="nx-btn nx-btn-secondary nx-btn-sm"
                onClick={() => setEditing(true)}
              >
                Edit title
              </button>
              <button
                type="button"
                className="nx-btn nx-btn-text nx-btn-sm"
                onClick={() => {
                  onClose();
                  onDelete(b);
                }}
              >
                Delete
              </button>
            </>
          ) : null
        ) : (
          <>
            <button
              type="button"
              className="nx-btn nx-btn-secondary nx-btn-sm"
              onClick={() => {
                onClose();
                onOpen?.(b.id);
              }}
            >
              Open
            </button>
            <button
              type="button"
              className="nx-btn nx-btn-text nx-btn-sm"
              onClick={() => onDone(b)}
            >
              {b.done ? "Not done" : "Done"}
            </button>
          </>
        )}
      </div>
    </div>,
    container
  );
}

/* ---------- "+N" ---------- */

export interface SlotMore {
  key: string;
  at: number;
  n: number;
  items: CalTimed[];
}

const moreLabel = (m: SlotMore) =>
  `${m.n} more at ${c2Time(m.at)} — show everything in this half hour`;

/** "+N" in the cluster's gutter on the grid. */
export function MoreChip({
  m,
  onPick,
  style,
  on,
}: {
  m: SlotMore;
  onPick: (m: SlotMore, el: HTMLElement, kbd: boolean) => void;
  style: React.CSSProperties;
  on: boolean;
}) {
  return (
    <button
      type="button"
      className="c2-more"
      data-c2-more={m.at}
      aria-label={moreLabel(m)}
      title={moreLabel(m)}
      aria-haspopup="dialog"
      aria-expanded={on}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onPick(m, e.currentTarget, e.detail === 0);
      }}
    >
      +{m.n}
    </button>
  );
}

/** "+N more at HH:MM" — the Agenda's fold row. */
export function MoreRow({
  m,
  onPick,
}: {
  m: SlotMore;
  onPick: (m: SlotMore, el: HTMLElement, kbd: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="c2-more-row"
      data-c2-more={m.at}
      aria-haspopup="dialog"
      title={moreLabel(m)}
      onClick={(e) => {
        e.stopPropagation();
        onPick(m, e.currentTarget, e.detail === 0);
      }}
    >
      <span className="c2-more-row-n">+{m.n}</span>
      <span className="c2-more-row-t">more at {c2Time(m.at)}</span>
    </button>
  );
}

/* ---------- slot list ---------- */

function SlotList({
  m,
  projects,
  today,
  onPick,
}: {
  m: SlotMore;
  projects?: readonly ProjectLike[];
  today: string;
  onPick: (b: CalTimed, el: HTMLElement) => void;
}) {
  return (
    <div className="c2-slot-list" role="list">
      {m.items.map((b) => {
        const v = taskView(b.entry, projects, today);
        const hue = b.event
          ? "var(--text-tertiary)"
          : v.hue || NEUTRAL_MARK.color;
        return (
          <button
            key={b.id}
            type="button"
            role="listitem"
            className={`c2-slot-row${b.done ? " is-done" : ""}`}
            data-c2-slot-item={b.id}
            onClick={(e) => onPick(b, e.currentTarget)}
          >
            <span
              aria-hidden="true"
              className="c2-slot-rail"
              style={{ background: hue }}
            />
            <span className="c2-slot-text">
              <span className="c2-slot-title">{b.title}</span>
              <span className="c2-slot-meta">
                {c2Time(b.at)}–{c2Time(c2End(b))}
                {b.event ? " · Event" : b.project ? ` · ${b.project}` : ""}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Everything that touches a half hour ($P/calendar2.jsx `C2SlotPop`). */
export function SlotPop({
  m,
  rect,
  leaving,
  kbd,
  projects,
  today,
  onPick,
  onClose,
}: {
  m: SlotMore;
  rect: Anchor;
  leaving: boolean;
  kbd: boolean;
  projects?: readonly ProjectLike[];
  today: string;
  onPick: (b: CalTimed, el: HTMLElement) => void;
  onClose: (refocus: boolean) => void;
}) {
  const container = useV3PortalContainer();
  const ref = useRef<HTMLDivElement>(null);
  const [y, setY] = useState(rect.top);
  const { right, left } = sideOf(rect, POP_W);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setY(
      Math.max(
        8,
        Math.min(rect.top - 12, window.innerHeight - el.offsetHeight - 8)
      )
    );
  }, [rect.top, m.key, container]);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t?.closest?.("[data-c2-slot-pop]") || t?.closest?.("[data-c2-more]"))
        return;
      closeRef.current(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current(true);
      }
    };
    document.addEventListener("mousedown", down, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("mousedown", down, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [m.key]);
  useEffect(() => {
    // opened from the keyboard: focus moves into the list
    if (kbd)
      ref.current?.querySelector("button")?.focus({ preventScroll: true });
  }, [kbd, m.key, container]);
  if (!container) return null;
  return createPortal(
    <div
      ref={ref}
      data-c2-slot-pop={m.at}
      role="dialog"
      aria-label={`Everything at ${c2Time(m.at)}`}
      className={`nx-pop c2-slot-pop${right ? "" : " is-right"}${leaving ? " is-leaving" : ""}`}
      style={{ left, top: y, width: POP_W }}
    >
      <div className="c2-slot-head">
        <span className="c2-slot-when">
          {c2Time(m.at)}–{c2Time(m.at + 0.5)}
        </span>
        <span className="c2-slot-count">
          {m.items.length} {m.items.length === 1 ? "item" : "items"}
        </span>
      </div>
      <SlotList m={m} projects={projects} today={today} onPick={onPick} />
    </div>,
    container
  );
}

/** The slot popover's state: open on a chip, close on pick / outside / Esc. */
export function useSlot() {
  const [slot, setSlot] = useState<{
    m: SlotMore;
    rect: Anchor;
    el: HTMLElement;
    kbd: boolean;
  } | null>(null);
  const last = useRef(slot);
  if (slot) last.current = slot;
  const [shown, leaving] = useExit(!!slot, POP_EXIT_MS);
  const open = useCallback(
    (m: SlotMore, el: HTMLElement, kbd: boolean) =>
      setSlot({ m, rect: anchorOf(el), el, kbd }),
    []
  );
  const close = useCallback((refocus: boolean) => {
    const s = last.current;
    setSlot(null);
    if (refocus && s?.el.isConnected) s.el.focus({ preventScroll: true });
  }, []);
  return {
    slot: shown ? last.current : null,
    leaving,
    open,
    close,
  };
}
