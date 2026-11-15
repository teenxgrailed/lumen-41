"use client";

import { type ReactNode, useState } from "react";

import { addCalendarDays, formatInTimeZone, newDate } from "@/lib/date-utils";
import type { MissedKeepStep } from "@/lib/needt3/hooks/missed-keep";

import { Ring } from "../work/parts";
import { missedLabel, overdueLabel } from "./now";

/**
 * HOME V2 (flag `home_v2`): the two shared pieces of the three-block Today.
 * Everything else on the screen is the existing Home, rearranged.
 */

/** The Tasks project card's frame colour (work/ProjectCards.tsx `frame`). */
export const railFrame = (hue: string) =>
  `color-mix(in oklab, ${hue} 24%, var(--background))`;

/**
 * All overdue work as ONE row: "N overdue -> Sort out". Closed by default;
 * opened, it holds the existing Spread / Move to today actions and the rows.
 * The count is the row's own number, not a tally above rows already on the
 * screen: while it is closed no overdue row is visible.
 */
export function OverdueRow({
  count,
  actions,
  note,
  children,
}: {
  count: number;
  /** The existing Spread / Move to today buttons. */
  actions: ReactNode;
  note?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (count <= 0) return null;
  return (
    <section
      className="hv2-late"
      data-hv2-late=""
      data-open={open || undefined}
    >
      <div className="hv2-late-head">
        <button
          type="button"
          className="hv2-late-main"
          aria-expanded={open}
          data-hv2-late-toggle=""
          onClick={() => setOpen((o) => !o)}
        >
          <span className="hv2-late-n">{overdueLabel(count)}</span>
          <span className="hv2-late-go">
            {open ? "Hide" : "Sort out"}
            <span aria-hidden="true">{open ? " ↑" : " →"}</span>
          </span>
        </button>
      </div>
      {open ? (
        <div className="hv2-late-body" data-hv2-late-body="">
          <div className="hv2-late-acts">{actions}</div>
          {note ? <p className="hv2-late-note">{note}</p> : null}
          {children}
        </div>
      ) : null}
    </section>
  );
}

/**
 * "Today 14:30", "Tomorrow 09:00", "Mon 10:00": the day is always said, so a
 * move never reads as a change of hour alone.
 */
function whenLabel(iso: string, tz: string) {
  const now = newDate();
  const d = newDate(iso);
  const day = formatInTimeZone(d, tz, "yyyy-MM-dd");
  const tomorrow = formatInTimeZone(
    addCalendarDays(now, 1, tz),
    tz,
    "yyyy-MM-dd"
  );
  const label =
    day === formatInTimeZone(now, tz, "yyyy-MM-dd")
      ? "Today"
      : day === tomorrow
        ? "Tomorrow"
        : formatInTimeZone(d, tz, "EEE");
  return `${label} ${formatInTimeZone(d, tz, "HH:mm")}`;
}

/**
 * Today's tasks whose time has passed and are not done: ONE quiet line under
 * the Now card instead of rows that hang silently in the list. "N tasks from
 * earlier today -> open slots" asks the scoped replan (`useMissedKeep`) where
 * only those tasks would go and shows it right under the line: title, new
 * time, the reason; what did not fit says so. Keep applies (the notice has
 * Undo), Dismiss closes. Nothing moves before Keep. Draws nothing without any.
 */
export function MissedLine({
  count,
  step,
  tz,
  onOpen,
  onKeep,
  onDismiss,
}: {
  count: number;
  step: MissedKeepStep;
  tz: string;
  onOpen: () => void;
  onKeep: () => void;
  onDismiss: () => void;
}) {
  if (count <= 0 && step.kind === "idle") return null;
  const shown = step.kind === "preview" || step.kind === "applying";
  const busy = step.kind === "previewing" || step.kind === "applying";
  const changes = shown ? step.changes : [];
  const unscheduled = shown ? step.unscheduled : [];
  return (
    <>
      <p className="hv2-missed" data-hv2-missed="">
        <span className="hv2-missed-t">{missedLabel(count)}</span>
        <button
          type="button"
          className="hv2-missed-go nx-focus"
          data-hv2-missed-go=""
          disabled={busy || shown}
          aria-busy={step.kind === "previewing" || undefined}
          onClick={onOpen}
        >
          <span aria-hidden="true">{"\u2192"}</span> open slots
        </button>
      </p>
      {shown ? (
        <section
          className="hv2-missed-prev"
          aria-label="Open slots for earlier tasks"
          data-hv2-missed-prev=""
        >
          {changes.length ? (
            <ul className="hv2-missed-rows" data-hv2-missed-changes="">
              {changes.map((c) => (
                <li
                  key={c.taskId}
                  className="hv2-missed-row"
                  data-change={c.taskId}
                >
                  <span className="hv2-missed-row-t">{c.title}</span>
                  {c.toStart ? (
                    <span className="hv2-missed-row-at">
                      {whenLabel(c.toStart, tz)}
                    </span>
                  ) : null}
                  <span className="hv2-missed-row-why">{c.explanation}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {unscheduled.length ? (
            <ul className="hv2-missed-rows" data-hv2-missed-unscheduled="">
              {unscheduled.map((u) => (
                <li
                  key={u.taskId}
                  className="hv2-missed-row"
                  data-unscheduled={u.taskId}
                >
                  <span className="hv2-missed-row-t">{u.title}</span>
                  <span className="hv2-missed-row-why">
                    Didn&apos;t fit today
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <span className="hv2-missed-acts">
            {changes.length ? (
              <button
                type="button"
                className="nx-btn nx-btn-primary nx-btn-sm"
                data-hv2-missed-keep=""
                disabled={busy}
                onClick={onKeep}
              >
                {step.kind === "applying" ? "Keeping\u2026" : "Keep"}
              </button>
            ) : null}
            <button
              type="button"
              className="nx-btn nx-btn-secondary nx-btn-sm"
              data-hv2-missed-dismiss=""
              disabled={busy}
              onClick={onDismiss}
            >
              Dismiss
            </button>
          </span>
        </section>
      ) : null}
    </>
  );
}

/** The day's count, quiet, at the right edge of the title: "3/13". */
export function DayCount({ done, total }: { done: number; total: number }) {
  if (total <= 0) return null;
  return (
    <span
      className="hv2-count"
      data-hv2-count={`${done}/${total}`}
      title={`${done} of ${total} done today`}
    >
      {done}/{total}
    </span>
  );
}

/** The Sunday review waits for the evening: it shows from 18:00 local. */
export const REVIEW_FROM_HOUR = 18;
export const reviewHour = (nowHour: number) => nowHour >= REVIEW_FROM_HOUR;

const PANEL_NAME: Record<string, string> = {
  today: "Today",
  habits: "Habits",
  week: "This week",
  schedule: "Today\u2019s schedule",
  inbox: "Inbox",
};

/**
 * A rail panel in the project-card style of Tasks: a frame in the hue, a white
 * plate inside it and a progress ring. `pct` null draws no ring (a panel with
 * no progress to show keeps the frame only). The panel inside keeps its own
 * content; CSS strips its own surface so the plate is the only card.
 */
export function RailFrame({
  hue,
  pct,
  label,
  children,
}: {
  hue: string;
  pct: number | null;
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      className="hv2-frame"
      data-hv2-frame={label}
      data-hv2-hue={hue}
      style={{ background: railFrame(hue) }}
    >
      <div className="hv2-plate">
        {children}
        {pct != null ? (
          <span
            className="hv2-ring"
            role="img"
            aria-label={`${PANEL_NAME[label] ?? label}, ${Math.round(pct * 100)}% done`}
          >
            <Ring pct={pct} hue={hue} />
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** done / total as 0..1; null when there is nothing to measure. */
export const ratio = (done: number, total: number): number | null =>
  total > 0 ? Math.min(1, Math.max(0, done / total)) : null;

/** The most common id (first wins a tie); null when none. */
export function dominant(ids: readonly (string | null | undefined)[]) {
  const n = new Map<string, number>();
  for (const id of ids) if (id) n.set(id, (n.get(id) ?? 0) + 1);
  let best: string | null = null;
  let top = 0;
  for (const [id, c] of n)
    if (c > top) {
      best = id;
      top = c;
    }
  return best;
}
