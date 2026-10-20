export interface HaTime {
  /** "6 h 12" */
  planned: string;
  /** "2 h 48"; absent when overbooked (no free time left). */
  free?: string;
  /** 0..1 of the working day: done (ink), still planned (mark) and now. */
  used: number;
  plan: number;
  now: number;
  /** When the working day ends ("18:00"). */
  ends?: string;
  /** Overbooked: by how much ("40 min") and when the day ends ("23:40"). */
  over?: { by: string; ends: string };
  /** Overbooked: the part that does not fit, as a share of the working day. */
  overFrac?: number;
}

/**
 * 7 - the time-left bar, drawn on the working day: what is behind (a quiet
 * solid stretch), what is still planned (solid ink), what is still free
 * (a dashed track), a now tick. Overbooked, the day's end gets a tick and the
 * part that does not fit runs on past it as red dashes; one line says by how
 * much. Draws nothing when there is nothing to compare.
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
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  // The axis is the working day; overbooked, it grows by what does not fit.
  const over = t.over ? clamp(t.overFrac ?? 0) : 0;
  const k = 1 / (1 + over);
  const pc = (v: number) => `${Math.round(v * 1000) / 10}%`;
  const at = (v: number) => pc(clamp(v) * k);
  const now = clamp(t.now);
  const plan = Math.min(clamp(t.plan), 1 - now);
  const ends = t.ends ?? t.over?.ends;
  const bar = (
    <>
      <div className="ha-tl-bar" aria-hidden>
        <span className="past" style={{ width: at(now) }} />
        <span className="plan" style={{ left: at(now), width: at(plan) }} />
        {t.over ? (
          <span
            className="spill"
            style={{ left: at(1), width: pc(over * k) }}
          />
        ) : (
          <span
            className="free"
            style={{ left: at(now + plan), width: at(1 - now - plan) }}
          />
        )}
        {t.over ? <span className="end" style={{ left: at(1) }} /> : null}
        <span className="now" style={{ left: at(now) }} />
      </div>
      <div className="ha-tl-ticks" aria-hidden>
        {k * (1 - now) > 0.2 ? (
          <span className="at-now" style={{ left: at(now) }}>
            now
          </span>
        ) : null}
        {ends ? (
          <span className="at-end" style={{ left: at(1) }}>
            {ends}
          </span>
        ) : null}
      </div>
    </>
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
