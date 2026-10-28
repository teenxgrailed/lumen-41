/**
 * Reading and writing a time of day typed into a field.
 *
 * Times are minutes from midnight, 0 to 1440 (1440 is the 24:00 that ends a
 * day, valid only as an end). No dates are involved, so nothing here touches
 * `date-utils`.
 */

const MERIDIEM = /(a|p)\.?(?:m\.?)?$/;

/**
 * "9", "930", "0930", "9:30", "9.30", "14:30", "2pm", "2:30 pm", "12am",
 * "24:00" → minutes; anything else → null.
 */
export function parseClock(text: string): number | null {
  let s = text.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  let meridiem: "a" | "p" | null = null;
  const m = MERIDIEM.exec(s);
  if (m) {
    meridiem = m[1] as "a" | "p";
    s = s.slice(0, m.index);
  }
  let h: number;
  let min = 0;
  const colon = /^(\d{1,2})[:.h](\d{1,2})$/.exec(s);
  if (colon) {
    h = +colon[1];
    min = +colon[2];
  } else if (/^\d{3,4}$/.test(s)) {
    h = +s.slice(0, s.length - 2);
    min = +s.slice(-2);
  } else if (/^\d{1,2}$/.test(s)) {
    h = +s;
  } else return null;
  if (min > 59) return null;
  if (meridiem) {
    if (h < 1 || h > 12) return null;
    return ((h % 12) + (meridiem === "p" ? 12 : 0)) * 60 + min;
  }
  if (h > 24 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

/** 570 → "09:30", or "9:30 am" on a 12-hour clock. 1440 reads as the day's end. */
export function formatClock(minutes: number, use12h: boolean): string {
  const total = Math.max(0, Math.min(1440, Math.round(minutes)));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const mm = String(m).padStart(2, "0");
  if (!use12h) return `${String(h).padStart(2, "0")}:${mm}`;
  const h12 = h % 12 || 12;
  return `${h12}:${mm} ${h % 24 < 12 ? "am" : "pm"}`;
}

/** The picker's rows: every `step` minutes from `from` up to and including `to`. */
export function clockSteps(from = 0, to = 24 * 60 - 15, step = 15): number[] {
  const out: number[] = [];
  for (let t = from; t <= to; t += step) out.push(t);
  return out;
}

/** The step in `options` closest to `minutes` (the first on a tie), or -1. */
export function nearestStep(options: readonly number[], minutes: number) {
  let best = -1;
  let gap = Infinity;
  options.forEach((o, i) => {
    const d = Math.abs(o - minutes);
    if (d < gap) {
      gap = d;
      best = i;
    }
  });
  return best;
}

/** To the nearest quarter hour. */
export const snapQuarter = (minutes: number) => Math.round(minutes / 15) * 15;
