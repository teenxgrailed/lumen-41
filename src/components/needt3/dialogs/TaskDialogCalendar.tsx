"use client";

import { useState } from "react";

import { LuChevronLeft, LuChevronRight } from "react-icons/lu";

import { TD_DOW, monthCells, monthTitle } from "./TaskDialogModel";

/** A month grid ($P/Dialogs.jsx TdCalendar): Monday first, today marked. */
export function TaskDialogCalendar({
  value,
  today,
  onPick,
}: {
  /** "YYYY-MM-DD" or null. */
  value: string | null;
  today: string;
  onPick: (day: string) => void;
}) {
  const base = value || today;
  const [ym, setYm] = useState(() => ({
    y: +base.slice(0, 4),
    m: +base.slice(5, 7) - 1,
  }));
  const shift = (n: number) =>
    setYm(({ y, m }) => {
      const k = y * 12 + m + n;
      return { y: Math.floor(k / 12), m: ((k % 12) + 12) % 12 };
    });
  return (
    <div className="tdc-cal">
      <div className="tdc-cal-head">
        <span className="tdc-cal-month">{monthTitle(ym.y, ym.m)}</span>
        <button
          type="button"
          className="tdc-icon-btn"
          aria-label="Previous month"
          onClick={() => shift(-1)}
        >
          <LuChevronLeft size={14} aria-hidden />
        </button>
        <button
          type="button"
          className="tdc-icon-btn"
          aria-label="Next month"
          onClick={() => shift(1)}
        >
          <LuChevronRight size={14} aria-hidden />
        </button>
      </div>
      <div className="tdc-cal-grid" role="grid">
        {TD_DOW.map((d) => (
          <span key={d} className="tdc-cal-dow">
            {d}
          </span>
        ))}
        {monthCells(ym.y, ym.m).map((c, i) =>
          c ? (
            <button
              key={c}
              type="button"
              className={`tdc-cal-day${c === value ? " is-on" : ""}${c === today ? " is-today" : ""}`}
              aria-pressed={c === value}
              onClick={() => onPick(c)}
            >
              {+c.slice(8)}
            </button>
          ) : (
            <span key={`e${i}`} />
          )
        )}
      </div>
    </div>
  );
}
