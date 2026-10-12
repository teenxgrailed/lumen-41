"use client";

import { LuChevronLeft, LuChevronRight } from "react-icons/lu";

import type { CalDay } from "../../calendar/layout";
import { pkCx, usePkPlate } from "../kit";
import { type MonthCell, dayLoad, weekLetters } from "./model";

/** ‹ › : one step of the week strip / the month. */
export function Step({
  dir,
  label,
  onStep,
}: {
  dir: -1 | 1;
  label: string;
  onStep: (k: -1 | 1) => void;
}) {
  return (
    <button
      type="button"
      className="v2p-step"
      aria-label={label}
      onClick={() => onStep(dir)}
      data-p5-step={dir}
    >
      {dir < 0 ? <LuChevronLeft size={16} /> : <LuChevronRight size={16} />}
    </button>
  );
}

/** The week strip (`V2pWeek`): seven days, the picked one on a plate, dots for what is planned. */
export function WeekStrip({
  week,
  startDay,
  selDay,
  today,
  count,
  onPick,
}: {
  week: readonly CalDay[];
  startDay: string;
  selDay: string;
  today: string;
  count: (date: string) => number;
  onPick: (date: string) => void;
}) {
  const plate = usePkPlate();
  const letters = weekLetters(startDay);
  return (
    <div className="v2p-week" role="tablist" aria-label="Days of the week">
      {week.map((d, i) => {
        const on = d.date === selDay;
        const n = count(d.date);
        return (
          <button
            key={d.date}
            type="button"
            role="tab"
            aria-selected={on}
            className={pkCx(
              "v2p-wd",
              on && "is-on",
              d.date === today && "is-today"
            )}
            onClick={() => onPick(d.date)}
            data-v2p-day={d.date}
            aria-label={`${d.long} ${d.n} ${d.mo}${n ? `, ${n} planned` : ""}`}
          >
            {on ? (
              <span className={`v2p-wd-plate ${plate}`} aria-hidden="true" />
            ) : null}
            <span className={pkCx("v2p-wd-in", on && plate)}>
              <span className="v2p-wd-letter">{letters[i]}</span>
              <span className="v2p-wd-num">{d.n}</span>
              <span className="v2p-wd-dots" aria-hidden="true">
                {[0, 1, 2].map((k) => (
                  <span
                    key={k}
                    className={pkCx(
                      "v2p-wd-dot",
                      k < Math.min(3, n) && "is-on"
                    )}
                  />
                ))}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The month grid (`V2pMonth`): a dot per day, its size how full the day is. */
export function MonthGrid({
  month,
  cells,
  startDay,
  selDay,
  today,
  count,
  onPick,
}: {
  month: string;
  cells: readonly MonthCell[];
  startDay: string;
  selDay: string;
  today: string;
  count: (date: string) => number;
  onPick: (date: string) => void;
}) {
  const plate = usePkPlate();
  return (
    <div className="v2p-month" data-v2p-month="">
      <div className="v2p-month-wd" aria-hidden="true">
        {weekLetters(startDay).map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
      <div className="v2p-month-grid" role="grid" aria-label={month}>
        {cells.map((c) => {
          const n = count(c.date);
          const on = c.date === selDay;
          return (
            <button
              key={c.date}
              type="button"
              aria-pressed={on}
              className={pkCx(
                "v2p-mc",
                on && "is-on",
                c.date === today && "is-today",
                c.other && "is-other"
              )}
              onClick={() => onPick(c.date)}
              data-v2p-mc={c.date}
              aria-label={`${c.label}${n ? `, ${n} planned` : ""}`}
            >
              {on ? (
                <span className={`v2p-mc-plate ${plate}`} aria-hidden="true" />
              ) : null}
              <span className={pkCx("v2p-mc-in", on && plate)}>
                <span className="v2p-mc-num">{c.n}</span>
                <span
                  className={`v2p-mc-dot is-${dayLoad(n)}`}
                  aria-hidden="true"
                />
              </span>
            </button>
          );
        })}
      </div>
      <p className="v2p-month-key">
        <span className="v2p-mc-dot is-1" />
        light <span className="v2p-mc-dot is-2" />
        <span className="v2p-mc-dot is-3" />
        <span className="v2p-mc-dot is-4" />
        full
      </p>
    </div>
  );
}
