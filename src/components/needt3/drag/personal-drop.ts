/* Whether a drop lands a task inside personal time — pure, so jest pins it.
 *
 * The scheduler never places a task in Lunch, a Walk or any other block the
 * person keeps. A person may still put one there by hand; the drop host asks
 * first. The patch carries the zone strings the v3 screens speak
 * ("YYYY-MM-DDTHH:mm", the person's own time zone).
 */
import { type DayBand, bandAt } from "@/lib/personal-time-days";

const STAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/;

const hourOf = (hh: string, mm: string) => Number(hh) + Number(mm) / 60;

/** The band a timed placement touches, or null. Tasks without a time touch none. */
export function personalHitForPlacement(
  bands: ReadonlyMap<string, readonly DayBand[]>,
  start: string | null | undefined,
  end: string | null | undefined
): DayBand | null {
  const a = start ? STAMP.exec(start) : null;
  if (!a) return null;
  const b = end ? STAMP.exec(end) : null;
  const from = hourOf(a[2], a[3]);
  if (!b || b[1] !== a[1]) {
    // no end (or one on another day): the start day, from the start to its end
    const stop = b ? 24 : Math.min(24, from + 0.5);
    return bandAt(bands.get(a[1]), from, stop);
  }
  const to = Math.max(hourOf(b[2], b[3]), from + 1 / 60);
  return bandAt(bands.get(a[1]), from, to);
}
