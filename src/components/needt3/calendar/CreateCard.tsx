"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

import { createPortal } from "react-dom";

import { clockSteps, snapQuarter } from "@/lib/needt3/clock-input";
import type { ProjectLike } from "@/lib/needt3/derive";
import { PERSONAL_PRESETS, type PersonalPreset } from "@/lib/personal-time";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { SSelect, V3Switch } from "../settings/kit";
import { Seg2 } from "./Seg2";
import { TimeField, useClock12 } from "./TimeField";

/** What the card makes: the main composer's kinds that have a time. */
export type CreateKind = "task" | "event" | "personal";

export const CREATE_KINDS: readonly (readonly [CreateKind, string])[] = [
  ["task", "Task"],
  ["event", "Event"],
  ["personal", "Personal time"],
];

/** The presets offered as chips under the card (owner, 27.10.26). */
const CHIP_KINDS = ["lunch", "break", "walk", "dinner", "gym", "rest"];
export const CREATE_CHIPS: readonly PersonalPreset[] = PERSONAL_PRESETS.filter(
  (p) => CHIP_KINDS.includes(p.kind)
);

/** A calendar an event can be written to (a Needt calendar; synced ones are read-only). */
export interface WritableCalendar {
  id: string;
  name: string;
}

/**
 * What the card asks for: shared by the grid's card and anything else that
 * creates at a time (the main composer keeps its own fields; the API is the
 * same `POST /api/tasks`, `/api/events`, `/api/personal-blocks`).
 */
export type CreateSpec =
  | {
      kind: "task";
      title: string;
      date: string;
      at: number;
      end: number;
      projectId: string | null;
      /** Pinned at this time (scheduleLocked); otherwise Needt places it. */
      pin: boolean;
    }
  | {
      kind: "event";
      title: string;
      date: string;
      at: number;
      end: number;
      /** null: the Needt calendar, created if missing. */
      calendarId: string | null;
    }
  | {
      kind: "personal";
      title: string;
      date: string;
      at: number;
      end: number;
      /** A preset chip; null for a block of your own named by the title. */
      preset: PersonalPreset | null;
    };

const CARD_W = 320;
const QUARTER = 0.25;
/** The start can be any quarter hour of the day; an end may also be 24:00. */
const STARTS = clockSteps(0, 24 * 60 - 15);

/** The range after the start moves to `minutes`: the length stays. */
export function moveStart(at: number, end: number, minutes: number) {
  const len = end - at;
  const next = Math.min(24 - QUARTER, Math.max(0, snapQuarter(minutes) / 60));
  return { at: next, end: Math.min(24, next + len) };
}

/**
 * The range after the end is set to `minutes`. An end at or before the start
 * is not an end: the length stays (and 00:00 after a start means midnight).
 */
export function moveEnd(at: number, end: number, minutes: number) {
  let b = snapQuarter(minutes) / 60;
  if (b === 0 && at > 0) b = 24;
  if (b <= at) b = Math.min(24, at + (end - at));
  return b > at ? { at, end: b } : { at, end };
}

/** 90 → "1 h 30 min". */
export function lengthText(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * The create card: anchored to the ghost block of a selection on the grid.
 * A type switch (Task, Event, Personal time), the title, the time range, and
 * per type what it needs: a task's length (from the range), project and pin;
 * an event's calendar. Personal time presets are a row of chips at the foot.
 * Enter creates, Esc cancels (and the ghost goes with it).
 *
 * Drawn in the shell's portal: the day column clips and contains its children.
 */
export function CreateCard({
  anchor,
  date,
  at,
  end,
  sized,
  kind,
  onKind,
  onRange,
  projects,
  calendars,
  onCreate,
  onCancel,
}: {
  anchor: RefObject<HTMLElement | null>;
  date: string;
  at: number;
  end: number;
  /** The range was drawn (dragged), not a click's default hour. */
  sized: boolean;
  kind: CreateKind;
  onKind: (k: CreateKind) => void;
  onRange: (at: number, end: number) => void;
  projects?: readonly ProjectLike[];
  calendars?: readonly WritableCalendar[];
  onCreate: (spec: CreateSpec) => void;
  onCancel: () => void;
}) {
  const container = useV3PortalContainer();
  const card = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [pin, setPin] = useState(true);
  const [calendarId, setCalendarId] = useState<string | null>(
    calendars?.[0]?.id ?? null
  );
  const use12h = useClock12();
  // The range as last set here: a field commits on blur or Enter, in the same
  // tick as a click on Create, before the parent has handed the new props back.
  const range = useRef({ at, end });
  useEffect(() => {
    range.current = { at, end };
  }, [at, end]);
  const done = useRef(false);

  // Beside the ghost, flipped near the window's edge; follows it on scroll.
  useEffect(() => {
    const place = () => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const h = card.current?.offsetHeight ?? 280;
      // never wider than the window (a phone is 320 wide at its narrowest)
      const w = Math.min(CARD_W, window.innerWidth - 16);
      const right = r.right + 8 + w <= window.innerWidth - 8;
      setPos({
        left: right ? r.right + 8 : Math.max(8, r.left - 8 - w),
        top: Math.max(8, Math.min(r.top, window.innerHeight - 8 - h)),
        width: w,
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor, at, end, kind]);

  useEffect(() => {
    if (!pos) return;
    titleRef.current?.focus({ preventScroll: true });
    // focus once, when the card first has a place
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!pos]);

  // A press outside the card and its ghost drops the draft.
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (card.current?.contains(t) || anchor.current?.contains(t)) return;
      cancel();
    };
    document.addEventListener("mousedown", down, true);
    return () => document.removeEventListener("mousedown", down, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cancel() {
    if (done.current) return;
    done.current = true;
    onCancel();
  }

  function setRange(r: { at: number; end: number }) {
    if (r.at === range.current.at && r.end === range.current.end) return;
    range.current = r;
    onRange(r.at, r.end);
  }

  function create(preset: PersonalPreset | null = null) {
    if (done.current) return;
    const t = title.trim();
    const { at, end } = range.current;
    if (preset) {
      done.current = true;
      // a click (no range drawn) keeps the preset's own length
      const until = sized ? end : Math.min(24, at + preset.minutes / 60);
      onCreate({ kind: "personal", title: t, date, at, end: until, preset });
      return;
    }
    if (kind !== "personal" && !t) {
      titleRef.current?.focus();
      return;
    }
    done.current = true;
    if (kind === "task")
      onCreate({ kind, title: t, date, at, end, projectId, pin });
    else if (kind === "event")
      onCreate({ kind, title: t, date, at, end, calendarId });
    else onCreate({ kind, title: t, date, at, end, preset: null });
  }

  const minutes = Math.round((end - at) * 60);
  const startMin = Math.round(at * 60);
  const endSteps = clockSteps(startMin + 15, 24 * 60);
  const placeholder =
    kind === "task"
      ? "Task name"
      : kind === "event"
        ? "Event title"
        : "Personal time";

  if (!container) return null;
  return createPortal(
    <div
      ref={card}
      role="dialog"
      aria-label="New on the calendar"
      data-c2-create=""
      data-kind={kind}
      className="nx-pop c2-create"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? 0,
        width: pos?.width ?? CARD_W,
        visibility: pos ? undefined : "hidden",
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cancel();
          return;
        }
        if (
          e.key === "Enter" &&
          !e.shiftKey &&
          (e.target as HTMLElement).tagName === "INPUT" &&
          (e.target as HTMLInputElement).type !== "checkbox"
        ) {
          e.preventDefault();
          create();
        }
      }}
    >
      <div className="c2-create-kind">
        <Seg2
          value={kind}
          options={CREATE_KINDS}
          onChange={(v) => onKind(v as CreateKind)}
        />
      </div>
      <input
        ref={titleRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        aria-label="Title"
        data-c2-create-title=""
        className="nt-input"
      />
      <div className="nt-form c2-create-form">
        <div className="nt-row">
          <span className="nt-row-label">Time</span>
          <div className="nt-row-control c2-create-range">
            <TimeField
              label="Start"
              value={Math.round(at * 60)}
              options={STARTS}
              use12h={use12h}
              data={{ "data-c2-create-from": "" }}
              onCommit={(m) =>
                setRange(moveStart(range.current.at, range.current.end, m))
              }
            />
            <span aria-hidden="true" className="c2-create-dash">
              –
            </span>
            <TimeField
              label="End"
              align="end"
              value={Math.round(end * 60)}
              options={endSteps}
              use12h={use12h}
              hint={(m) => lengthText(m - startMin)}
              data={{ "data-c2-create-to": "" }}
              onCommit={(m) =>
                setRange(moveEnd(range.current.at, range.current.end, m))
              }
            />
          </div>
        </div>
        {kind === "task" ? (
          <>
            <div className="nt-row">
              <span className="nt-row-label">Duration</span>
              <div className="nt-row-control">
                <span className="c2-create-len" data-c2-create-len="">
                  {lengthText(minutes)}
                </span>
              </div>
            </div>
            <div className="nt-row">
              <span className="nt-row-label">Project</span>
              <div className="nt-row-control">
                <SSelect
                  label="Project"
                  width="100%"
                  value={projectId ?? ""}
                  onChange={(v) => setProjectId(v || null)}
                  options={[
                    ["", "Inbox"],
                    ...(projects ?? []).map((p) => [p.id, p.name] as const),
                  ]}
                />
              </div>
            </div>
            <div className="nt-row">
              <span className="nt-row-label">Pin at this time</span>
              <div className="nt-row-control">
                <V3Switch
                  checked={pin}
                  onChange={setPin}
                  label="Pin at this time"
                />
              </div>
            </div>
          </>
        ) : null}
        {kind === "event" ? (
          <div className="nt-row">
            <span className="nt-row-label">Calendar</span>
            <div className="nt-row-control">
              <SSelect
                label="Calendar"
                width="100%"
                value={calendarId ?? ""}
                onChange={(v) => setCalendarId(v || null)}
                options={
                  calendars && calendars.length > 0
                    ? calendars.map((c) => [c.id, c.name] as const)
                    : [["", "Needt"] as const]
                }
              />
            </div>
          </div>
        ) : null}
      </div>
      <div className="c2-create-foot">
        <button
          type="button"
          className="nx-btn nx-btn-text"
          onClick={() => cancel()}
        >
          Cancel
        </button>
        <button
          type="button"
          className="nx-btn nx-btn-secondary"
          data-c2-create-go=""
          onClick={() => create()}
        >
          Create
        </button>
      </div>
      <div
        className="c2-create-chips"
        role="group"
        aria-label="Keep this time for you"
      >
        {CREATE_CHIPS.map((preset) => (
          <button
            key={preset.kind}
            type="button"
            data-pb-preset={preset.kind}
            className="c2-create-chip"
            onClick={() => create(preset)}
          >
            <span aria-hidden="true">{preset.emoji}</span>
            <span>{preset.title}</span>
          </button>
        ))}
      </div>
    </div>,
    container
  );
}
