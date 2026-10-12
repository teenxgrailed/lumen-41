"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { FiChevronLeft, FiChevronRight } from "react-icons/fi";

import type { ProjectLike } from "@/lib/needt3/derive";

import type { DragProps } from "../drag/useDrag";
import { Task } from "../task/Task";
import { Seg2 } from "./Seg2";
import type { CalItem, CalTimed } from "./blocks";
import {
  C2_CAP,
  type CalDay,
  c2AgendaFold,
  c2Time,
  c2WithGaps,
  spanLabel,
} from "./layout";
import { MoreRow, type SlotMore, SlotPop, useSlot } from "./popovers";

export const AGENDA_SIZES = [3, 5, 7] as const;
export type AgendaSize = (typeof AGENDA_SIZES)[number];

/** An agenda row: `<Task>`'s agenda row; a task row lifts like a block. */
function Row({
  b,
  onOpen,
  stacked,
  compact,
  dragProps,
}: {
  b: CalItem;
  onOpen?: (id: string) => void;
  stacked: boolean;
  compact: boolean;
  dragProps?: DragProps;
}) {
  const row = (
    <Task
      layout="row"
      density="agenda"
      task={b.entry}
      onOpen={onOpen ? (id) => onOpen(id) : undefined}
      stacked={stacked}
      compact={compact}
    />
  );
  return !b.event && dragProps ? (
    <div
      className="c2-row-drag"
      {...dragProps({ id: b.id, title: b.title }, "move")}
    >
      {row}
    </div>
  ) : (
    row
  );
}

export interface DaysViewProps {
  days: readonly CalDay[];
  blocks: readonly CalTimed[];
  loose: readonly CalItem[];
  today: string;
  n: AgendaSize;
  onN: (n: AgendaSize) => void;
  onPage: (dir: -1 | 1) => void;
  projects?: readonly ProjectLike[];
  onOpen?: (id: string) => void;
  dragProps?: DragProps;
  /** The hour of the task in the hand, for the day tag. */
  carryAt: number | null;
}

/**
 * AGENDA (internal value "days") — a column per day: header, all-day items,
 * then timed rows, 3 / 5 / 7 at a time, paged with ‹ ›. Each column is a
 * "day" drop target (time kept); the gap between two timed rows is a
 * "timeline" strip at the time between them ($P/calendar2.jsx AGENDA DROP).
 */
export function DaysView({
  days,
  blocks,
  loose,
  today,
  n,
  onN,
  onPage,
  projects,
  onOpen,
  dragProps,
  carryAt,
}: DaysViewProps) {
  /* Stack title over meta when a column is too narrow to hold both on one
     line; one ResizeObserver on the grid gives the width. */
  const gridRef = useRef<HTMLDivElement>(null);
  const [gw, setGw] = useState(0);
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setGw((cur) => (Math.abs(cur - w) < 0.5 ? cur : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [days, n]);
  const stacked = n >= 5 || (gw > 0 && (gw - (n - 1) * 10) / n < 400);
  const sl = useSlot();
  const pickSlot = (b: CalTimed) => {
    sl.close(false);
    if (!b.event && onOpen) onOpen(b.id);
  };
  const first = days[0]?.date ?? "";

  return (
    <div className="c2-stack">
      <div className="c2-days-bar">
        <button
          type="button"
          aria-label="Previous days"
          className="nx-btn nx-btn-text nx-btn-sm c2-days-page"
          onClick={() => onPage(-1)}
        >
          <FiChevronLeft size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Next days"
          className="nx-btn nx-btn-text nx-btn-sm c2-days-page"
          onClick={() => onPage(1)}
        >
          <FiChevronRight size={15} aria-hidden="true" />
        </button>
        <span data-c2-range="1" className="c2-days-range">
          {spanLabel(days, false)}
        </span>
        <span className="c2-days-seg">
          <Seg2
            value={String(n)}
            onChange={(v) => onN(Number(v) as AgendaSize)}
            options={AGENDA_SIZES.map((k) => [String(k), `${k} days`] as const)}
          />
        </span>
      </div>
      <div
        key={`${first}-${n}`}
        ref={gridRef}
        className="nx-swap c2-days-grid"
        data-c2-days={n}
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {days.map((d) => {
          const isToday = d.date === today;
          const timed = blocks
            .filter((b) => b.date === d.date)
            .sort((a, b) => a.at - b.at);
          const allDay = loose.filter((b) => b.date === d.date);
          const items: CalItem[] = [...allDay, ...timed];
          return (
            <section
              key={d.date}
              data-c2-col={d.date}
              aria-label={`${d.long} ${d.n} ${d.mo}`}
              className={`c2-col${isToday ? " is-today" : ""}`}
              data-drop="day"
              data-c2-agenda-day=""
              data-date={d.date}
              data-label={`${d.wd} ${d.n} ${d.mo}${carryAt != null ? ` · ${c2Time(carryAt)}` : ""}`}
            >
              <header className="c2-col-head">
                <span className="c2-col-wd">{n === 7 ? d.wd : d.long}</span>
                <span className="c2-col-date">
                  {d.mo} {d.n}
                </span>
                {isToday && n < 7 ? (
                  <span className="c2-col-today">Today</span>
                ) : null}
              </header>
              <div className="scroll-inner c2-col-scroll">
                {items.length ? (
                  c2WithGaps(c2AgendaFold(items, C2_CAP)).map((it) =>
                    it.gap ? (
                      <div
                        key={it.key}
                        className="c2-gap"
                        aria-hidden="true"
                        data-c2-gap={c2Time(it.at)}
                        data-drop="timeline"
                        data-date={d.date}
                        data-start={it.at}
                        data-hour-h="100000"
                        data-offset="0"
                      />
                    ) : it.row.more ? (
                      <MoreRow
                        key={it.row.key}
                        m={it.row as SlotMore}
                        onPick={sl.open}
                      />
                    ) : (
                      <Row
                        key={it.row.b.id}
                        b={it.row.b}
                        onOpen={onOpen}
                        stacked={stacked}
                        compact={n === 7}
                        dragProps={dragProps}
                      />
                    )
                  )
                ) : (
                  <div data-c2-empty="1" className="c2-col-empty">
                    Nothing planned
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {sl.slot ? (
        <SlotPop
          key={sl.slot.m.key}
          m={sl.slot.m}
          rect={sl.slot.rect}
          kbd={sl.slot.kbd}
          leaving={sl.leaving}
          projects={projects}
          today={today}
          onPick={pickSlot}
          onClose={sl.close}
        />
      ) : null}
    </div>
  );
}
