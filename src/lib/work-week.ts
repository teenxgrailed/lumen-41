import {
  type WorkScheduleWindowInput,
  sanitizeScheduleWindows,
} from "@/lib/work-schedules";

/**
 * Working hours as the week editor and the API see them: one entry per
 * weekday (0 = Sunday), each switched on or off, with one or two ranges.
 * The stored form is `WorkScheduleWindow` rows on the default `WorkSchedule`,
 * which is what the scheduler, the calendar shading and "Plan my day" read.
 */
export interface WeekRange {
  start: string;
  end: string;
}

export interface WeekDay {
  day: number;
  on: boolean;
  ranges: WeekRange[];
}

export type WeekHours = WeekDay[];

export const MAX_RANGES_PER_DAY = 2;
/** Monday first, as the editor lists them. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const WEEKDAYS = [1, 2, 3, 4, 5] as const;

const DEFAULT_RANGE: WeekRange = { start: "09:00", end: "17:00" };

export const timeToMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Seven entries, Sunday to Saturday; days with no window are off. */
export function windowsToWeek(
  windows: readonly {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    sortOrder?: number;
  }[]
): WeekHours {
  return Array.from({ length: 7 }, (_, day) => {
    const ranges = windows
      .filter((window) => window.dayOfWeek === day)
      .sort(
        (a, b) =>
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
          a.startTime.localeCompare(b.startTime)
      )
      .map((window) => ({ start: window.startTime, end: window.endTime }));
    return { day, on: ranges.length > 0, ranges };
  });
}

/** Only days that are on contribute windows. */
export function weekToWindows(week: WeekHours): WorkScheduleWindowInput[] {
  return week
    .filter((entry) => entry.on)
    .flatMap((entry) =>
      entry.ranges.map((range, sortOrder) => ({
        dayOfWeek: entry.day,
        startTime: range.start,
        endTime: range.end,
        sortOrder,
      }))
    );
}

/** The old single range, used for every day in `days`. */
export function weekFromLegacy(
  days: readonly number[],
  startHour: number,
  endHour: number
): WeekHours {
  const range = {
    start: minutesToTime(startHour * 60),
    end: minutesToTime(endHour * 60),
  };
  return Array.from({ length: 7 }, (_, day) => {
    const on = days.includes(day);
    return { day, on, ranges: on ? [{ ...range }] : [] };
  });
}

/**
 * Check a week from outside (API body). Throws a readable message on the
 * first problem; returns a normalised week otherwise.
 */
export function parseWeek(value: unknown): WeekHours {
  if (!Array.isArray(value)) throw new Error("weekHours must be a list");
  const byDay = new Map<number, WeekDay>();
  for (const item of value) {
    if (!item || typeof item !== "object") {
      throw new Error("Each weekHours entry needs a day");
    }
    const entry = item as Record<string, unknown>;
    const day = Number(entry.day);
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new Error("weekHours day must be 0 (Sunday) to 6 (Saturday)");
    }
    if (byDay.has(day)) throw new Error("weekHours repeats a day");
    const ranges = Array.isArray(entry.ranges) ? entry.ranges : [];
    if (ranges.length > MAX_RANGES_PER_DAY) {
      throw new Error(`A day holds at most ${MAX_RANGES_PER_DAY} ranges`);
    }
    const on = entry.on === true;
    // Reuses the stored-window rules: valid HH:mm, start before end, no overlap.
    const clean = on
      ? sanitizeScheduleWindows(
          ranges.map((range) => {
            const r = (range ?? {}) as Record<string, unknown>;
            return { dayOfWeek: day, startTime: r.start, endTime: r.end };
          })
        )
      : [];
    if (on && clean.length === 0) {
      throw new Error("A day that is on needs at least one range");
    }
    byDay.set(day, {
      day,
      on,
      ranges: clean.map((window) => ({
        start: window.startTime,
        end: window.endTime,
      })),
    });
  }
  return Array.from(
    { length: 7 },
    (_, day) => byDay.get(day) ?? { day, on: false, ranges: [] }
  );
}

/**
 * The columns the single-range world still reads (capacity, nudges, the old
 * settings store): the days that are on, the earliest start and latest end
 * as whole hours.
 */
export function legacyFromWeek(week: WeekHours): {
  workDays: number[];
  workHourStart: number;
  workHourEnd: number;
} {
  const open = week.filter((entry) => entry.on && entry.ranges.length > 0);
  if (open.length === 0) {
    return { workDays: [], workHourStart: 9, workHourEnd: 17 };
  }
  const starts = open.flatMap((e) =>
    e.ranges.map((r) => timeToMinutes(r.start))
  );
  const ends = open.flatMap((e) => e.ranges.map((r) => timeToMinutes(r.end)));
  return {
    workDays: open.map((entry) => entry.day).sort((a, b) => a - b),
    workHourStart: Math.floor(Math.min(...starts) / 60),
    workHourEnd: Math.min(23, Math.ceil(Math.max(...ends) / 60)),
  };
}

/** Latest end across the week, as HH:mm. */
export function latestEnd(week: WeekHours): string | null {
  const ends = week
    .filter((entry) => entry.on)
    .flatMap((entry) => entry.ranges.map((range) => range.end));
  return ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : null;
}

/** "Copy to all weekdays": Monday-to-Friday take the source day's ranges. */
export function copyToWeekdays(week: WeekHours, sourceDay: number): WeekHours {
  const source = week.find((entry) => entry.day === sourceDay);
  if (!source) return week;
  return week.map((entry) =>
    (WEEKDAYS as readonly number[]).includes(entry.day) &&
    entry.day !== sourceDay
      ? {
          ...entry,
          on: source.on,
          ranges: source.ranges.map((range) => ({ ...range })),
        }
      : entry
  );
}

export function setDayOn(week: WeekHours, day: number, on: boolean): WeekHours {
  return week.map((entry) =>
    entry.day !== day
      ? entry
      : {
          ...entry,
          on,
          ranges:
            on && entry.ranges.length === 0
              ? [{ ...DEFAULT_RANGE }]
              : entry.ranges,
        }
  );
}

export function setRange(
  week: WeekHours,
  day: number,
  index: number,
  patch: Partial<WeekRange>
): WeekHours {
  return week.map((entry) =>
    entry.day !== day
      ? entry
      : {
          ...entry,
          ranges: entry.ranges.map((range, i) =>
            i === index ? { ...range, ...patch } : range
          ),
        }
  );
}

/** Adds a second range an hour after the first ends (afternoon by default). */
export function addRange(week: WeekHours, day: number): WeekHours {
  return week.map((entry) => {
    if (entry.day !== day || entry.ranges.length >= MAX_RANGES_PER_DAY) {
      return entry;
    }
    const last = entry.ranges[entry.ranges.length - 1];
    const startMinutes = last ? timeToMinutes(last.end) + 60 : 13 * 60;
    const endMinutes = Math.min(startMinutes + 4 * 60, 23 * 60 + 45);
    if (startMinutes >= endMinutes) return entry;
    return {
      ...entry,
      on: true,
      ranges: [
        ...entry.ranges,
        { start: minutesToTime(startMinutes), end: minutesToTime(endMinutes) },
      ],
    };
  });
}

export function removeRange(
  week: WeekHours,
  day: number,
  index: number
): WeekHours {
  return week.map((entry) =>
    entry.day !== day || entry.ranges.length <= 1
      ? entry
      : { ...entry, ranges: entry.ranges.filter((_, i) => i !== index) }
  );
}

const HALF_HOURS = Array.from({ length: 48 }, (_, i) => minutesToTime(i * 30));

/**
 * Times a start or end field may take so the range stays valid: start before
 * end, and the two ranges of one day in order without overlap. The stored
 * value is always kept so the field can show it.
 */
export function timeChoices(
  week: WeekHours,
  day: number,
  index: number,
  which: "start" | "end"
): string[] {
  const entry = week.find((item) => item.day === day);
  const range = entry?.ranges[index];
  if (!entry || !range) return [];
  const previous = entry.ranges[index - 1];
  const next = entry.ranges[index + 1];
  const own = which === "start" ? range.start : range.end;
  const list = HALF_HOURS.filter((time) =>
    which === "start"
      ? time < range.end && (!previous || time >= previous.end)
      : time > range.start && (!next || time <= next.start)
  );
  return list.includes(own) ? list : [...list, own].sort();
}

/** True when every range is valid and ranges on a day do not overlap. */
export function weekIsValid(week: WeekHours): boolean {
  try {
    parseWeek(week);
    return true;
  } catch {
    return false;
  }
}
