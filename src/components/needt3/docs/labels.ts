/**
 * The age strings the docs grid shows ("20 min ago", "Yesterday", "2 Sep"),
 * from the API's ISO stamps. `now` is passed in (epoch ms), so a screen reads
 * the clock once and a test pins it.
 */
import { MONTHS } from "@/lib/needt3/derive";

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Local calendar day of an epoch, as a comparable number (yyyymmdd). */
function dayKey(ms: number) {
  const d = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);
  return Number(d.replace(/-/g, ""));
}

export function ageLabel(iso: string | null | undefined, now: number) {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return "";
  const ago = now - t;
  if (ago < MIN) return "Just now";
  if (ago < HOUR) return `${Math.floor(ago / MIN)} min ago`;
  const today = dayKey(now);
  const that = dayKey(t);
  if (that === today) return `${Math.floor(ago / HOUR)} h ago`;
  if (that === dayKey(now - 24 * HOUR)) return "Yesterday";
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(t);
  const get = (k: string) =>
    Number(parts.find((p) => p.type === k)?.value ?? 0);
  const label = `${get("day")} ${MONTHS[get("month") - 1]}`;
  const yearNow = Math.floor(today / 10000);
  return get("year") === yearNow ? label : `${label} ${get("year")}`;
}
