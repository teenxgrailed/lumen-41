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

/** The chip text: "Every week", or "Custom" for a rule the menu does not offer. */
export function repeatLabel(rule: string | null | undefined): string | null {
  const key = repeatKey(rule);
  if (key === null) return null;
  if (key === "custom") return "Custom";
  return REPEAT_CHOICES.find((c) => c.key === key)?.label ?? null;
}
