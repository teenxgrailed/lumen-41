import { RecurrenceConverter } from "./recurrence-converter";

/**
 * Todoist keeps recurrence as the natural-language string a person typed
 * ("every mon, fri", "every 3 weeks"). This reads the common English forms
 * into an RRULE body (no `RRULE:` prefix, the shape Task.recurrenceRule
 * stores). Anything it does not recognise returns null: the importer then
 * keeps the task without recurrence and appends the original wording to the
 * description, rather than guessing a schedule the person never set.
 *
 * Time of day ("every day at 9am") is dropped here on purpose: the due
 * datetime already carries it. "every!" (repeat from completion) has no RRULE
 * form and is read like "every".
 */

const DAY_CODES: Record<string, string> = {
  mo: "MO",
  mon: "MO",
  monday: "MO",
  tu: "TU",
  tue: "TU",
  tues: "TU",
  tuesday: "TU",
  we: "WE",
  wed: "WE",
  wednesday: "WE",
  th: "TH",
  thu: "TH",
  thur: "TH",
  thurs: "TH",
  thursday: "TH",
  fr: "FR",
  fri: "FR",
  friday: "FR",
  sa: "SA",
  sat: "SA",
  saturday: "SA",
  su: "SU",
  sun: "SU",
  sunday: "SU",
};

const DAY_ORDER = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

const UNIT_FREQ: Record<string, string> = {
  day: "DAILY",
  days: "DAILY",
  week: "WEEKLY",
  weeks: "WEEKLY",
  month: "MONTHLY",
  months: "MONTHLY",
  year: "YEARLY",
  years: "YEARLY",
};

const SHORTHAND: Record<string, string> = {
  daily: "FREQ=DAILY",
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
  yearly: "FREQ=YEARLY",
  annually: "FREQ=YEARLY",
};

const WORD_NUMBERS: Record<string, number> = {
  other: 2,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

function normalise(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/every!/g, "every")
      // Drop a trailing time of day: "at 9am", "at 18:30", "@ 9".
      .replace(/\s+(at|@)\s+[\d:.]+\s*(am|pm)?\s*$/, "")
      // "starting tomorrow" only sets the first date, which due already has.
      .replace(/\s+(starting|from)\s+.+$/, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function parseDays(list: string): string[] | null {
  const parts = list
    .split(/\s*(?:,|\band\b|&)\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const codes = new Set<string>();
  for (const part of parts) {
    const code = DAY_CODES[part];
    if (!code) return null;
    codes.add(code);
  }
  return DAY_ORDER.filter((d) => codes.has(d));
}

/** "every 0 days" or "every 5000 weeks" is not a schedule anyone set. */
function validInterval(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 999;
}

function ordinalDay(text: string): number | null {
  if (text === "last day" || text === "last") return -1;
  const match = /^(\d{1,2})(st|nd|rd|th)?( day)?$/.exec(text);
  if (!match) return null;
  const n = Number(match[1]);
  return n >= 1 && n <= 31 ? n : null;
}

export function parseTodoistRecurrence(
  input: string | null | undefined
): string | null {
  if (!input) return null;
  const text = normalise(input);

  if (SHORTHAND[text]) return SHORTHAND[text];
  if (!text.startsWith("every ")) return null;
  const rest = text.slice("every ".length);

  if (rest === "weekday" || rest === "workday")
    return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
  if (rest === "weekend") return "FREQ=WEEKLY;BYDAY=SA,SU";

  // every day / every 3 weeks / every other month
  const interval = /^(?:(\d+|other|two|three|four|five|six) )?([a-z]+)$/.exec(
    rest
  );
  if (interval && UNIT_FREQ[interval[2]]) {
    const raw = interval[1];
    const n = raw ? (WORD_NUMBERS[raw] ?? Number(raw)) : 1;
    if (!validInterval(n)) return null;
    const freq = `FREQ=${UNIT_FREQ[interval[2]]}`;
    return n === 1 ? freq : `${freq};INTERVAL=${n}`;
  }

  // every month on the 15th / every month on the last day
  const monthOn = /^(?:(\d+|other) )?months? on the (.+)$/.exec(rest);
  if (monthOn) {
    const day = ordinalDay(monthOn[2]);
    if (day === null) return null;
    const raw = monthOn[1];
    const n = raw ? (WORD_NUMBERS[raw] ?? Number(raw)) : 1;
    if (!validInterval(n)) return null;
    return n === 1
      ? `FREQ=MONTHLY;BYMONTHDAY=${day}`
      : `FREQ=MONTHLY;INTERVAL=${n};BYMONTHDAY=${day}`;
  }

  // every 15th / every last day
  const nth = ordinalDay(rest.replace(/^the /, ""));
  if (nth !== null && /\d|last/.test(rest)) {
    return `FREQ=MONTHLY;BYMONTHDAY=${nth}`;
  }

  // every mon, fri / every other tuesday
  const other = /^other (.+)$/.exec(rest);
  const days = parseDays(other ? other[1] : rest);
  if (days && days.length > 0) {
    return other
      ? `FREQ=WEEKLY;INTERVAL=2;BYDAY=${days.join(",")}`
      : `FREQ=WEEKLY;BYDAY=${days.join(",")}`;
  }

  return null;
}

export class UnsupportedTodoistRecurrenceError extends Error {
  constructor(public readonly original: string) {
    super(`Unsupported Todoist recurrence: ${original}`);
    this.name = "UnsupportedTodoistRecurrenceError";
  }
}

export class TodoistRecurrenceConverter extends RecurrenceConverter {
  /** Todoist string → `RRULE:…`; throws when the wording is not supported. */
  convertToRRule(recurrence: unknown): string {
    const text = typeof recurrence === "string" ? recurrence : "";
    const body = parseTodoistRecurrence(text);
    if (!body) throw new UnsupportedTodoistRecurrenceError(text);
    return `RRULE:${body}`;
  }

  /** The import is one-way; Needt never writes recurrence back to Todoist. */
  convertFromRRule(): string {
    throw new Error("Todoist recurrence is import-only");
  }
}
