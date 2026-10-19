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
  key: string;
  /** "11:00" */
  t: string;
  task?: {
    id?: string | null;
    title: string;
    c: string;
    d: string;
    /** A calendar event, not a task: not opened, no task menu. */
    event?: boolean;
    done?: boolean;
    past?: boolean;
  };
  band?: HaBandData;
  /** The row the day is at: the now line is drawn above it. */
  now?: boolean;
  /** Only the now line and its time (the day is past every row). */
  bare?: boolean;
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
      data-ha-band=""
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
export function HaTimeline({
  rows,
  onOpen,
}: {
  rows: readonly HaTimelineRow[];
  /** A task row was tapped. */
  onOpen?: (id: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <div className="ha-tline" data-ha-tline="">
      {rows.map((r) => (
        <Fragment key={r.key}>
          {r.now ? <div className="ha-nowline" aria-hidden="true" /> : null}
          <div className={haCx("ha-trow", r.now && "is-now")}>
            <span className="ha-trow-t">{r.t}</span>
            {r.bare ? (
              <span />
            ) : r.band ? (
              <HaBand b={r.band} />
            ) : r.task ? (
              <div
                className={haCx(
                  "ha-task",
                  r.task.done && "is-done",
                  r.task.past && "is-past"
                )}
                style={{ "--c": r.task.c } as CSSProperties}
                data-ctx={r.task.event ? undefined : "task"}
                data-ctx-id={
                  r.task.event ? undefined : (r.task.id ?? undefined)
                }
                onClick={() => {
                  const id = r.task?.id;
                  if (!r.task?.event && id) onOpen?.(id);
                }}
                title={r.task.title}
              >
                <b className="ha-task-t">{r.task.title}</b>
                <span>{r.task.d}</span>
              </div>
            ) : null}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
