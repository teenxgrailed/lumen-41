/* FREE TIME — the stretch of today nothing is booked into.
 *
 * Pure, so the proactive-nudge job and its test share one rule: given the
 * rest of the working day and what is already booked in it, which is the
 * longest unbooked stretch, and is it long enough to say anything about.
 */

export interface Span {
  /** Epoch milliseconds, inclusive. */
  start: number;
  /** Epoch milliseconds, exclusive. */
  end: number;
}

/** A gap shorter than this is not worth interrupting anyone for. */
export const FREE_TIME_MIN_MS = 2 * 60 * 60_000;

/**
 * The longest stretch of `window` that no span in `busy` touches, or null when
 * even that is shorter than `minMs`. Busy spans may overlap, arrive in any
 * order, and run outside the window.
 */
export function longestFreeGap(
  window: Span,
  busy: readonly Span[],
  minMs: number = FREE_TIME_MIN_MS
): Span | null {
  if (window.end <= window.start) return null;
  const sorted = busy
    .filter((s) => s.end > window.start && s.start < window.end)
    .map((s) => ({
      start: Math.max(s.start, window.start),
      end: Math.min(s.end, window.end),
    }))
    .sort((a, b) => a.start - b.start);

  let best: Span | null = null;
  let cursor = window.start;
  const consider = (start: number, end: number) => {
    if (end - start >= minMs && (!best || end - start > best.end - best.start))
      best = { start, end };
  };
  for (const s of sorted) {
    if (s.start > cursor) consider(cursor, s.start);
    cursor = Math.max(cursor, s.end);
  }
  consider(cursor, window.end);
  return best;
}

/** "14:00–16:00" for a gap, in the zone `fmt` formats for. */
export function describeGap(
  gap: Span,
  fmt: (ms: number) => string
): { range: string; hours: number } {
  const hours = Math.round(((gap.end - gap.start) / 3_600_000) * 2) / 2;
  return { range: `${fmt(gap.start)}–${fmt(gap.end)}`, hours };
}
