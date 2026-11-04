"use client";

import { Fragment, useEffect, useState } from "react";

import { newDate } from "@/lib/date-utils";
import {
  MAP_ROWS,
  type MilestoneView,
  type PullLogRow,
  QUIT_STEPS,
  type RunParts,
  type UrgeMap,
  stepLabel,
} from "@/lib/needt3/habits-quit";
import type { V3Habit } from "@/lib/needt3/map";

/*
 * Habits: Quit (additions-4/habits-quit, hq.jsx). The pieces here are pure:
 * props in, callbacks out. Copy rules: "Pulling", "Held", "I slipped" /
 * "Start again"; never relapse, failed, lost or streak broken; no
 * exclamation marks, no counts of missed days.
 */

const Check = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path
      d="M2.5 6.2 5 8.6l4.5-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const QuitX = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path
      d="M3.5 3.5l7 7m0-7-7 7"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

export const QuitHeld = () => (
  <span className="hq-held">
    <Check />
  </span>
);

/** A clock that moves once a minute (the counter shows minutes at most). */
export function useMinuteClock(live = true): Date {
  const [now, setNow] = useState(() => newDate());
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => setNow(newDate()), 30_000);
    return () => window.clearInterval(t);
  }, [live]);
  return now;
}

/** "12 d 4 h 17 m": the live run. Only the minute re-renders, and only it rises. */
export function QuitCounter({
  run,
  big,
  minutes,
}: {
  run: RunParts;
  big?: boolean;
  minutes?: boolean;
}) {
  return (
    <b className={big ? "big hq-num" : "hq-num"}>
      {run.days}
      <small>d</small>
      {run.hours}
      <small>h</small>
      {minutes ? (
        <>
          <span key={run.minutes} className="hq-tick">
            {String(run.minutes).padStart(2, "0")}
          </span>
          <small>m</small>
        </>
      ) : null}
    </b>
  );
}

const runWords = (r: RunParts) =>
  `${r.days} ${r.days === 1 ? "day" : "days"} ${r.hours} ${r.hours === 1 ? "hour" : "hours"}`;

/** The line under a Quit habit's title: what is next, or the best run after a restart. */
export function quitMeta(ms: MilestoneView, restarted: boolean, best: number) {
  if (restarted) return `Started again · best ${best} d`;
  if (ms.next === null) return "A year without";
  return `Next: ${ms.next} ${ms.next === 1 ? "day" : "days"}, in ${ms.left}`;
}

/** 1 · the desktop card: a live count instead of the fourteen cells, one button. */
export function QuitCard({
  habit,
  run,
  meta,
  onPull,
  onOpen,
}: {
  habit: V3Habit;
  run: RunParts;
  meta: string;
  onPull: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      className="hq-card nx-press"
      role="button"
      tabIndex={0}
      data-hq-quit={habit.id}
      aria-label={`${habit.title} — ${runWords(run)} without`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="hq-card-top">
        <span className="hq-dot" style={{ background: "var(--hq-ink-3)" }} />
        <span className="t">{habit.title}</span>
        <span className="at">Quit</span>
      </div>
      <span className="hq-meta">{meta}</span>
      <div className="hq-card-foot">
        <span className="hq-count">
          <QuitCounter run={run} minutes />
          <span>without</span>
        </span>
        <button
          type="button"
          className="hq-btn is-sm"
          data-hq-pull={habit.id}
          onClick={(e) => {
            e.stopPropagation();
            onPull();
          }}
        >
          Pulling
        </button>
      </div>
    </div>
  );
}

/** 1 · the phone row. */
export function QuitRow({
  habit,
  run,
  meta,
  onPull,
  onOpen,
}: {
  habit: V3Habit;
  run: RunParts;
  meta: string;
  onPull: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="hq-row" data-hq-quit={habit.id}>
      <span
        className="hq-dot"
        style={{
          background: "var(--hq-ink-3)",
          width: 10,
          height: 10,
          borderRadius: 5,
        }}
      />
      <button
        type="button"
        className="body hq-row-open"
        aria-label={`${habit.title} — ${runWords(run)} without`}
        onClick={onOpen}
      >
        <b>{habit.title}</b>
        <span>
          {run.days} d {run.hours} h without · {meta}
        </span>
      </button>
      <button
        type="button"
        className="hq-btn is-sm"
        data-hq-pull={habit.id}
        onClick={onPull}
      >
        Pulling
      </button>
    </div>
  );
}

/** 8 · Free: Quit is visible, greyed, with one way forward. */
export function QuitLock({
  inline,
  storeBuild,
  onSeePro,
}: {
  inline?: boolean;
  /** A store build names no price and links nowhere (App Review 3.1.1). */
  storeBuild?: boolean;
  onSeePro: () => void;
}) {
  return (
    <div className={`hq-lock${inline ? " is-inline" : ""}`} data-hq-lock="">
      <div className="hq-card-top">
        <span className="t">Quit a habit</span>
        <span className="hq-pro">PRO</span>
      </div>
      <div className="ex" aria-hidden>
        <b>12 d 4 h</b>
        <span className="hq-meta">without</span>
      </div>
      <p>
        Count the time without something, a Pulling button with breathing and
        your own reason, a map of when it pulls, and the assistant when it does
        not pass.
      </p>
      <div className="acts">
        {storeBuild ? null : (
          <button type="button" className="hq-btn" onClick={onSeePro}>
            See Pro
          </button>
        )}
        <span className="hq-meta">Do habits stay free, up to 3.</span>
      </div>
    </div>
  );
}

/** 2 · the next milestone; the accent is only the progress fill. */
export function QuitMilestone({
  ms,
  run,
}: {
  ms: MilestoneView;
  run: RunParts;
}) {
  if (ms.next === null) return null;
  return (
    <div className="hq-ms">
      <div className="hq-ms-l">
        <span>
          <b>
            {ms.next} {ms.next === 1 ? "day" : "days"}
          </b>{" "}
          in {ms.left}
        </span>
        <span>{ms.pct}%</span>
      </div>
      <div
        className="hq-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={ms.pct}
        aria-label={`Progress to ${ms.next} days`}
      >
        <i style={{ width: `${ms.pct}%` }} />
      </div>
      <div className="hq-ms-steps">
        {QUIT_STEPS.map((s) => (
          <span
            key={s}
            className={s <= run.days ? "past" : s === ms.next ? "next" : ""}
          >
            {stepLabel(s)}
          </span>
        ))}
      </div>
    </div>
  );
}

const Pips = ({ n }: { n: number }) => (
  <span className="hq-pips" aria-label={`Strength ${n} of 5`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <i key={i} className={i <= n ? "on" : ""} />
    ))}
  </span>
);

/** 2 · the last seven days of pulls. */
export function QuitPullLog({ rows }: { rows: readonly PullLogRow[] }) {
  if (!rows.length)
    return (
      <p className="hq-meta hq-empty">
        No pulls logged yet. Pulling is the button for when it hits.
      </p>
    );
  return (
    <div className="hq-log">
      {rows.map((l) => (
        <div key={l.id} className="hq-log-row">
          <span className="w">{l.when}</span>
          <span>
            {l.tag ?? "Pull"} {l.strength ? <Pips n={l.strength} /> : null}
          </span>
          <span className={`o${l.outcome === "Held" ? " ok" : ""}`}>
            {l.outcome ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}

const HOUR_LABELS = ["0", "", "4", "", "8", "", "12", "", "16", "", "20", ""];

/** 2 · when it pulls: weekdays by two-hour blocks, on the grey ladder only. */
export function QuitMap({ map }: { map: UrgeMap }) {
  return (
    <div>
      <div
        className="hq-map"
        role="img"
        aria-label={`Pulls by hour and weekday. ${map.note ?? ""}`.trim()}
      >
        <span />
        {HOUR_LABELS.map((h, i) => (
          <span key={i}>{h}</span>
        ))}
        {map.levels.map((row, r) => (
          <Fragment key={r}>
            <span>{MAP_ROWS[r]}</span>
            {row.map((v, c) => (
              <i key={c} className={`l${v}`} />
            ))}
          </Fragment>
        ))}
      </div>
      {map.note ? <p className="hq-map-note">{map.note}</p> : null}
    </div>
  );
}

/** "I slipped": what resets and what stays. */
export function QuitSlipConfirm({
  run,
  best,
  clean,
  busy,
  onCancel,
  onConfirm,
}: {
  run: RunParts;
  best: number;
  clean: number;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="hq-confirm" role="dialog" aria-label="Start again">
      <b>Start again from now?</b>
      <p>
        The current run ends at {run.days} d {run.hours} h. Nothing else is
        lost.
      </p>
      <ul>
        <li>
          Current run<b>0 d, from now</b>
        </li>
        <li>
          Best run<b>{Math.max(best, run.days)} d, kept</b>
        </li>
        <li>
          Clean in all<b>{clean} d, kept</b>
        </li>
      </ul>
      <div className="acts">
        <button type="button" className="hq-btn is-text" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="hq-btn"
          data-hq-slip-confirm=""
          disabled={busy}
          onClick={onConfirm}
        >
          Start again
        </button>
      </div>
    </div>
  );
}
