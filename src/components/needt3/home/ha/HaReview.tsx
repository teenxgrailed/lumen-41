"use client";

import type { CSSProperties } from "react";

import { HaI } from "./ui";

export interface HaWin {
  b: string;
  span: string;
}

export interface HaFocusOption {
  title: string;
  /** The project's colour, a dot. */
  color: string;
}

/** How many focuses the review asks for. */
export const HA_REVIEW_PICKS = 3;

/**
 * 10 - the Sunday weekly review sheet: the week's wins, what is left over and
 * exactly three focuses for next week, which become that week's highlight
 * candidates (`/api/week-focus`).
 */
export function HaReview({
  title,
  sub,
  wins,
  winLines,
  leftOver,
  options,
  picked,
  nextWeek,
  busy,
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
  leftOver: readonly string[];
  options: readonly HaFocusOption[];
  /** Indexes into `options`, in the order picked. */
  picked: readonly number[];
  /** The number of the week the focuses are for. */
  nextWeek: number;
  busy?: boolean;
  onPick: (index: number) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const ready = picked.length === HA_REVIEW_PICKS;
  return (
    <div className="ha-sheet" role="dialog" aria-label="Weekly review">
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
      <div className="ha-wins">
        {wins.map((w) => (
          <div key={w.span} className="ha-win">
            <b>{w.b}</b>
            <span>{w.span}</span>
          </div>
        ))}
      </div>
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
      ) : null}
      {leftOver.length ? (
        <>
          <div className="ha-sec-l">
            Left over <span>{leftOver.length} → next week</span>
          </div>
          {leftOver.map((t) => (
            <div
              key={t}
              className="ha-doneline"
              style={{ color: "var(--ha-ink)" }}
            >
              <span
                className="ha-tick"
                style={{
                  background: "transparent",
                  boxShadow: "inset 0 0 0 1.5px var(--ha-ink-3)",
                }}
              />
              {t}
            </div>
          ))}
        </>
      ) : null}
      <div className="ha-sec-l">
        Pick {HA_REVIEW_PICKS} focuses{" "}
        <span>
          {picked.length} of {HA_REVIEW_PICKS}
        </span>
      </div>
      <div className="ha-focus-pick">
        {options.map((o, k) => {
          const on = picked.includes(k);
          return (
            <button
              key={o.title}
              type="button"
              className="ha-fp"
              aria-pressed={on}
              disabled={!on && picked.length >= HA_REVIEW_PICKS}
              onClick={() => onPick(k)}
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
      <div className="ha-sheet-foot">
        <button
          type="button"
          className="ha-btn is-primary is-lg"
          disabled={!ready || busy}
          style={ready ? undefined : { opacity: 0.4 }}
          onClick={onSubmit}
        >
          Start week {nextWeek}
        </button>
      </div>
    </div>
  );
}
