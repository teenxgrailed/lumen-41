import type { CSSProperties } from "react";

export interface HaTime {
  /** "6 h 12" */
  planned: string;
  /** "2 h 48"; absent when overbooked (no free time left). */
  free?: string;
  /** 0..1 of the working day: done (ink), still planned (mark) and now. */
  used: number;
  plan: number;
  now: number;
  /** Overbooked: by how much ("40 min") and when the day ends ("23:40"). */
  over?: { by: string; ends: string };
}

/**
 * 7 - the time-left bar: a thin line, done (ink), still planned (mark), a now
 * tick. Overbooked, the planned part turns red and one line says by how much.
 * Draws nothing when there is nothing to compare.
 */
export function HaTimeLeft({
  t,
  onMoveOne,
}: {
  t: HaTime | null | undefined;
  /** Overbooked: "Move one" (shown only when something can answer it). */
  onMoveOne?: () => void;
}) {
  if (!t) return null;
  const pct = (v: number) =>
    `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`;
  const bar = (
    <div className="ha-tl-bar">
      <span className="used" style={{ width: pct(t.used) }} />
      <span className="plan" style={{ width: pct(t.plan) }} />
      <span
        className="now"
        style={{ "--now": Math.min(1, Math.max(0, t.now)) } as CSSProperties}
      />
    </div>
  );
  if (t.over)
    return (
      <div
        className="ha-tl is-over"
        data-ha-tl="over"
        aria-label={`Overbooked by ${t.over.by}`}
      >
        <div className="ha-tl-l">
          <span>
            <b>{t.planned}</b> planned
          </span>
          <span>no free time left</span>
        </div>
        {bar}
        <div className="ha-tl-warn">
          <i />
          Overbooked by {t.over.by} — the day ends at {t.over.ends}.
          {onMoveOne ? (
            <button
              type="button"
              className="ha-btn is-text"
              onClick={onMoveOne}
            >
              Move one
            </button>
          ) : null}
        </div>
      </div>
    );
  return (
    <div
      className="ha-tl"
      data-ha-tl=""
      aria-label={`${t.planned} planned, ${t.free ?? "no time"} free today`}
    >
      <div className="ha-tl-l">
        <span>
          <b>{t.planned}</b> planned
        </span>
        <span>
          <b>{t.free}</b> free
        </span>
      </div>
      {bar}
    </div>
  );
}
