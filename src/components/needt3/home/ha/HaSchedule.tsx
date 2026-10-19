"use client";

import { type ReactNode, useState } from "react";

import { scheduleWindow } from "../derive";
import { HaTimeline, type HaTimelineRow } from "./HaTimeline";

/**
 * Today's schedule on desktop (8): the card with the day's timeline, personal
 * blocks among the rows. A packed day shows a window around the now line.
 */
export function HaSchedule({
  rows,
  onOpen,
  onCalendar,
  footer,
}: {
  rows: readonly HaTimelineRow[];
  onOpen: (id: string) => void;
  onCalendar: () => void;
  /** Under the rows: "Keep time for you". */
  footer?: ReactNode;
}) {
  const [all, setAll] = useState(false);
  const nowAt = rows.findIndex((r) => r.now);
  const shown = scheduleWindow(rows, nowAt, all);
  return (
    <section className="ha-card ha-sched" data-ha-schedule="">
      <div className="ha-dk-card-t">
        <span>Today’s schedule</span>
        <button type="button" className="ha-link" onClick={onCalendar}>
          Calendar
        </button>
      </div>
      {rows.length ? (
        <HaTimeline rows={shown} onOpen={onOpen} />
      ) : (
        <span className="ha-meta">Nothing timed today.</span>
      )}
      {shown.length < rows.length || all ? (
        <button
          type="button"
          className="ha-link ha-sched-more"
          data-ha-sched-more=""
          onClick={() => setAll(!all)}
        >
          {all ? "Show around now" : `Show all ${rows.length}`}
        </button>
      ) : null}
      {footer}
    </section>
  );
}
