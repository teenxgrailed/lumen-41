/**
 * The task editor's "Repeat" choices ($P/Dialogs.jsx TD_REPEAT) and the
 * RRULE text each one is stored as in `Task.recurrenceRule`. A rule that is
 * none of these (an Outlook series, a rule written through the API) is
 * "custom": shown, kept, and never rewritten by merely opening the menu.
 */
export type RepeatKey = "daily" | "weekdays" | "weekly" | "monthly";

export const REPEAT_CHOICES: readonly {
  key: RepeatKey | null;
  label: string;
  rule: string | null;
}[] = [
  { key: null, label: "Never", rule: null },
  { key: "daily", label: "Every day", rule: "FREQ=DAILY" },
  {
    key: "weekdays",
    label: "Every weekday",
    rule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  },
  { key: "weekly", label: "Every week", rule: "FREQ=WEEKLY" },
  { key: "monthly", label: "Every month", rule: "FREQ=MONTHLY" },
];

/** A rule in one comparable shape: no `RRULE:`, parts sorted, `INTERVAL=1` dropped. */
function canonical(rule: string): string {
  return rule
    .trim()
    .replace(/^RRULE:/i, "")
    .toUpperCase()
    .split(";")
    .filter((p) => p && p !== "INTERVAL=1")
    .map((p) =>
      p.startsWith("BYDAY=")
        ? `BYDAY=${p.slice(6).split(",").sort().join(",")}`
        : p
    )
    .sort()
    .join(";");
}

/** Which choice a stored rule is; `"custom"` for any other rule, null for none. */
export function repeatKey(
  rule: string | null | undefined
): RepeatKey | "custom" | null {
  if (!rule) return null;
  const c = canonical(rule);
  for (const choice of REPEAT_CHOICES) {
    if (choice.rule && canonical(choice.rule) === c) return choice.key;
  }
  return "custom";
}

export const WEEK_DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];
const DAY_NAME: Record<WeekDay, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
};

export type RepeatFreq = "DAILY" | "WEEKLY" | "MONTHLY";

/** The editor's shape: every `interval` days / weeks / months, on `days` for weeks. */
export interface CustomRepeat {
  freq: RepeatFreq;
  interval: number;
  days: WeekDay[];
}

/** The RRULE text for a custom repeat. Days apply to weeks only. */
export function buildRule(c: CustomRepeat): string {
  const interval = Math.min(99, Math.max(1, Math.round(c.interval) || 1));
  const days = WEEK_DAYS.filter((d) => c.days.includes(d));
  return [
    `FREQ=${c.freq}`,
    interval > 1 ? `INTERVAL=${interval}` : null,
    c.freq === "WEEKLY" && days.length ? `BYDAY=${days.join(",")}` : null,
  ]
    .filter(Boolean)
    .join(";");
}

/** What the editor shows for a stored rule; null when it uses parts the editor does not write. */
export function readCustom(
  rule: string | null | undefined
): CustomRepeat | null {
  if (!rule) return null;
  const parts = new Map(
    rule
      .trim()
      .replace(/^RRULE:/i, "")
      .toUpperCase()
      .split(";")
      .filter(Boolean)
      .map((p) => p.split("=") as [string, string])
  );
  const freq = parts.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY") return null;
  for (const k of parts.keys())
    if (k !== "FREQ" && k !== "INTERVAL" && k !== "BYDAY") return null;
  const interval = Number(parts.get("INTERVAL") ?? 1);
  if (!Number.isInteger(interval) || interval < 1) return null;
  const days = (parts.get("BYDAY") ?? "").split(",").filter(Boolean);
  if (days.length && freq !== "WEEKLY") return null;
  if (!days.every((d) => (WEEK_DAYS as readonly string[]).includes(d)))
    return null;
  return { freq, interval, days: days as WeekDay[] };
}

/** "Every 2 weeks", "Mon, Wed", "Every 3 days". */
function describe(c: CustomRepeat): string {
  if (c.freq === "WEEKLY" && c.days.length && c.interval === 1)
    return c.days.map((d) => DAY_NAME[d]).join(", ");
  const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month" }[c.freq];
  const base =
    c.interval === 1 ? `Every ${unit}` : `Every ${c.interval} ${unit}s`;
  return c.freq === "WEEKLY" && c.days.length
    ? `${base} · ${c.days.map((d) => DAY_NAME[d]).join(", ")}`
    : base;
}

/** The chip text: "Every week", "Mon, Wed", or "Custom" for a rule the editor cannot read. */
export function repeatLabel(rule: string | null | undefined): string | null {
  const key = repeatKey(rule);
  if (key === null) return null;
  if (key === "custom") {
    const c = readCustom(rule);
    return c ? describe(c) : "Custom";
  }
  return REPEAT_CHOICES.find((c) => c.key === key)?.label ?? null;
}
