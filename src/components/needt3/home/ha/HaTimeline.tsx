import { type CSSProperties, Fragment } from "react";

import { haCx } from "./ui";

export interface HaBandData {
  /** The block's emoji. */
  e: string;
  n: string;
  /** "12:30–13:15" */
  time: string;
  /** A colour of the block (its palette token, resolved). */
  hue: string;
}

export interface HaTimelineRow {
  /** "11:00" */
  t: string;
  task?: { title: string; c: string; d: string };
  band?: HaBandData;
  /** The row the day is at: the now line is drawn above it. */
  now?: boolean;
}

/**
 * 8 - a personal time block in the day timeline: a soft striped band in the
 * block's own hue, emoji and name, a MINE tag. Never a checkbox, never a task
 * row.
 */
export function HaBand({ b }: { b: HaBandData }) {
  return (
    <div
      className="ha-band"
      style={{ "--hue": b.hue } as CSSProperties}
      aria-label={`Personal time: ${b.n}, ${b.time}`}
    >
      <span className="ha-band-e" aria-hidden="true">
        {b.e}
      </span>
      <b>{b.n}</b>
      <span>
        {b.time}
        <em className="ha-mine">Mine</em>
      </span>
    </div>
  );
}

/** 8 - the day timeline: task rows, personal bands and the now line. */
export function HaTimeline({ rows }: { rows: readonly HaTimelineRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="ha-tline">
      {rows.map((r, k) => (
        <Fragment key={k}>
          {r.now ? <div className="ha-nowline" aria-hidden="true" /> : null}
          <div className={haCx("ha-trow", r.now && "is-now")}>
            <span className="ha-trow-t">{r.t}</span>
            {r.band ? (
              <HaBand b={r.band} />
            ) : r.task ? (
              <div
                className="ha-task"
                style={{ "--c": r.task.c } as CSSProperties}
              >
                <b
                  style={{
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {r.task.title}
                </b>
                <span>{r.task.d}</span>
              </div>
            ) : null}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
