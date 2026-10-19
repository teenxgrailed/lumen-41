"use client";

import type { CSSProperties } from "react";

import { type HaLeft, HaLeftList, type HaTarget } from "./HaLeftList";
import { HaI, haCx } from "./ui";

export interface HaWin {
  b: string;
  span: string;
}

/** A thing to focus the next week on: an open task or a project. */
export interface HaFocusOption {
  /** "task:<id>" or "project:<id>" */
  key: string;
  kind: "task" | "project";
  id: string;
  title: string;
  /** The project's colour, a dot. */
  color: string;
}

/** How many focuses the review asks for. */
export const HA_REVIEW_PICKS = 3;

/**
 * 10 - the Sunday weekly review sheet: the week's wins, what is left over
 * (each moves to Monday, a date or the Inbox) and exactly three focuses for
 * next week, picked from open tasks and projects. They become that week's
 * highlight candidates (`/api/week-focus`).
 */
export function HaReview({
  title,
  sub,
  wins,
  winLines,
  leftovers,
  moves,
  date,
  minDate,
  options,
  picked,
  nextWeek,
  busy,
  onMove,
  onDate,
  onPick,
  onSubmit,
  onClose,
}: {
  /** "Week 43 in review" */
  title: string;
  /** "Sunday · 12–18 October" */
  sub: string;
  wins: readonly HaWin[];
  winLines: readonly string[];
  leftovers: readonly HaLeft[];
  moves: Readonly<Record<string, HaTarget>>;
  date: string;
  minDate: string;
  options: readonly HaFocusOption[];
  /** Keys of `options`, in the order picked. */
  picked: readonly string[];
  /** The number of the week the focuses are for. */
  nextWeek: number;
  busy?: boolean;
  onMove: (id: string, to: HaTarget) => void;
  onDate: (date: string) => void;
  onPick: (key: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const need = Math.min(HA_REVIEW_PICKS, options.length);
  const ready = picked.length === need;
  return (
    <div
      className="ha-sheet"
      role="dialog"
      aria-label="Weekly review"
      data-ha-review=""
    >
      <div className="ha-grab" />
      <div className="ha-sheet-h">
        <div>
          <h3>{title}</h3>
          <span className="ha-meta">{sub}</span>
        </div>
        <button
          type="button"
          className="ha-x"
          aria-label="Close"
          onClick={onClose}
        >
          <HaI n="x" />
        </button>
      </div>
      {wins.length ? (
        <div className="ha-wins">
          {wins.map((w) => (
            <div key={w.span} className="ha-win">
              <b>{w.b}</b>
              <span>{w.span}</span>
            </div>
          ))}
        </div>
      ) : null}
      {winLines.length ? (
        <>
          <div className="ha-sec-l">Wins</div>
          {winLines.map((t) => (
            <div key={t} className="ha-doneline">
              <span className="ha-tick">
                <HaI n="check" />
              </span>
              {t}
            </div>
          ))}
        </>
      ) : (
        <p className="ha-meta" data-ha-quiet="">
          A quiet week.
        </p>
      )}
      {leftovers.length ? (
        <>
          <div className="ha-sec-l">
            Left over <span>{leftovers.length} → next week</span>
          </div>
          <HaLeftList
            leftovers={leftovers}
            moves={moves}
            labels={{ tomorrow: "Monday" }}
            date={date}
            minDate={minDate}
            onMove={onMove}
            onDate={onDate}
          />
        </>
      ) : null}
      {options.length ? (
        <>
          <div className="ha-sec-l">
            Pick {need} {need === 1 ? "focus" : "focuses"}{" "}
            <span>
              {picked.length} of {need}
            </span>
          </div>
          <div className="ha-focus-pick">
            {options.map((o) => {
              const on = picked.includes(o.key);
              return (
                <button
                  key={o.key}
                  type="button"
                  className={haCx("ha-fp")}
                  data-ha-focus={o.key}
                  aria-pressed={on}
                  disabled={!on && picked.length >= HA_REVIEW_PICKS}
                  onClick={() => onPick(o.key)}
                >
                  <i
                    className="ha-dot"
                    style={{ "--c": o.color } as CSSProperties}
                  />
                  {o.title}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
      <div className="ha-sheet-foot">
        <button
          type="button"
          className="ha-btn is-primary is-lg"
          data-ha="review-save"
          disabled={(options.length > 0 && !ready) || busy}
          style={options.length > 0 && !ready ? { opacity: 0.4 } : undefined}
          onClick={onSubmit}
        >
          Start week {nextWeek}
        </button>
      </div>
    </div>
  );
}
