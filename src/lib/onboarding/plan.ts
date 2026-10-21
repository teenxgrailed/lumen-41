import {
  type CalendarBusyBlock,
  type SchedulableTask,
  type ScheduledBlock,
  type SchedulingPreferences,
  type SchedulingTaskPriority,
  scheduleTasks,
} from "@/services/scheduling/engine";

import {
  addCalendarDays,
  formatInTimeZone,
  fromZonedTime,
  startOfDayInTimeZone,
} from "@/lib/date-utils";

import {
  type OnboardingAnswers,
  type PlanTask,
  planTasks,
  rankedAreas,
} from "./answers";
import { type DayPart, WEEKDAY_LONG, WEEKDAY_SHORT, areaById } from "./catalog";
import { dur, durH, hhmm, partName } from "./format";

/**
 * The first week, planned by the real scheduling engine
 * (src/services/scheduling/engine.ts) and nothing else.
 *
 * The answers become what the engine already understands: work schedules
 * (hours per weekday, one per kind of task and part of day), busy blocks
 * (calendar events and lunch), tasks with a priority from the rank, a
 * longest block (max chunk) and a start day that spreads repeats over the
 * week. The engine places the blocks; this file only reads what it did and
 * reports it. Every number on the "planning" screen comes from that run.
 *
 * Pure: no database, no clock except the `now` it is given.
 */

const SPACING = {
  minBreakMinutes: 15,
  bufferMultiplier: 1.3,
  maxDeepWork: 180,
};
const FOCUS_MIN_MINUTES = 45;

/** One calendar event in the week being planned. day 0 = Monday, hours decimal. */
export interface PlanEvent {
  day: number;
  start: number;
  end: number;
  title: string;
}

export interface PlannedItem {
  /** `<task id>~<n>~<chunk>`: stable for one run. */
  key: string;
  id: string;
  title: string;
  area: string;
  minutes: number;
  day: number;
  start: number;
  end: number;
  /** "1/2" when a long task was split; "" otherwise. */
  part: string;
  why: string;
}

export interface LeftItem {
  id: string;
  title: string;
  area: string;
  minutes: number;
}

export interface PlanDay {
  day: number;
  short: string;
  long: string;
  /** Day of the month. */
  n: number;
  mon: string;
}

export interface PlanStats {
  eventCount: number;
  freeBefore: number;
  freeAfter: number;
  planned: number;
  lunches: number;
  instances: number;
  splitTasks: number;
  /** Most blocks of one repeating task on a single day (1 = never twice a day). */
  maxRepeatPerDay: number;
  byArea: Record<string, number>;
}

export interface WeekPlan {
  /** Monday of the week planned, yyyy-MM-dd in the person's zone. */
  weekStart: string;
  days: PlanDay[];
  events: PlanEvent[];
  placed: PlannedItem[];
  left: LeftItem[];
  stats: PlanStats;
  /** The seven lines of the "planning" screen: [title, detail]. */
  steps: [string, string][];
  /** Which hours the grid should show. */
  range: { lo: number; hi: number };
  source: "sample" | "calendar";
}

/** The calendar a visitor without a connected account sees: 12 events, Monday first. */
export const SAMPLE_EVENTS: readonly PlanEvent[] = [
  [0, 10, 11, "Team sync"],
  [0, 15, 15.5, "1:1 with Lea"],
  [1, 14, 15, "Client call"],
  [1, 17.5, 18.5, "Padel"],
  [2, 9, 9.5, "Standup"],
  [2, 12.5, 13.5, "Lunch with Ana"],
  [3, 9.5, 10.5, "Design review"],
  [3, 16, 17, "Dentist"],
  [4, 11, 12, "Planning"],
  [4, 13.5, 14.5, "Demo"],
  [5, 11, 12.5, "Brunch"],
  [6, 15, 17, "Football"],
].map(([day, start, end, title]) => ({
  day: day as number,
  start: start as number,
  end: end as number,
  title: title as string,
}));

/** The Monday of the week after `now`, as midnight in `timeZone`. */
export function nextWeekStart(now: Date, timeZone: string): Date {
  const today = startOfDayInTimeZone(now, timeZone);
  const iso = Number(formatInTimeZone(today, timeZone, "i")); // Mon = 1 .. Sun = 7
  return addCalendarDays(today, 8 - iso, timeZone);
}

const engineDay = (d: number) => String((d + 1) % 7);

function wallAt(weekStart: Date, day: number, hour: number, timeZone: string) {
  const date = formatInTimeZone(
    addCalendarDays(weekStart, day, timeZone),
    timeZone,
    "yyyy-MM-dd"
  );
  const total = Math.round(hour * 60);
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return fromZonedTime(`${date}T${hh}:${mm}:00`, timeZone);
}

const timeStr = (hour: number) => hhmm(hour);

/** Hours for a part of day inside a day's window, or null when nothing is left. */
function partWindow(
  part: DayPart,
  s: number,
  e: number
): [number, number] | null {
  const w: [number, number] =
    part === "m"
      ? [s, Math.min(12, e)]
      : part === "a"
        ? [Math.max(12, s), Math.min(17, e)]
        : part === "e"
          ? [Math.max(17, s), e]
          : [s, e];
  return w[1] - w[0] >= 0.25 ? w : null;
}

type Kind = "work" | "life";

export type ScheduleKey = `${Kind}:${DayPart}`;

/** The work schedule a kind of task and a part of the day stand for. */
export const scheduleKey = (kind: Kind, part: DayPart): ScheduleKey =>
  `${kind}:${part}`;

/** Readable name for the schedule row an account gets when it is first used. */
export function scheduleName(kind: Kind, part: DayPart): string {
  const who = kind === "work" ? "Work" : "Personal";
  return part
    ? `${who} ${partName(part)}s`
    : kind === "work"
      ? "Work Hours"
      : "Personal hours";
}

export interface ScheduleTable {
  /** Days in play, Monday = 0. */
  days: number[];
  workdaySet: Set<number>;
  hoursOf: (d: number) => [number, number];
  /** Hours per schedule key, days counted the engine's way (Sunday = 0). */
  byKey: Record<string, Record<string, { start: string; end: string }>>;
  latestEnd: number;
}

/**
 * Work schedules for the answers: one hours map per kind of task (work =
 * workdays only, life = any day in play) and per part of the day. The preview
 * hands these to the engine and the commit writes the same windows as
 * `WorkSchedule` rows, so both plan inside identical hours.
 */
export function scheduleTable(a: OnboardingAnswers): ScheduleTable {
  const workdaySet = new Set(a.workdays);
  const days = [0, 1, 2, 3, 4, 5, 6].filter(
    (d) => workdaySet.has(d) || (a.weekends && !workdaySet.has(d))
  );
  const hoursOf = (d: number): [number, number] =>
    workdaySet.has(d)
      ? [a.hours.start, a.hours.end]
      : [a.daysOff.start, a.daysOff.end];
  const byKey: ScheduleTable["byKey"] = {};
  for (const kind of ["work", "life"] as const) {
    for (const part of ["", "m", "a", "e"] as const) {
      const map: Record<string, { start: string; end: string }> = {};
      for (const d of days) {
        if (kind === "work" && !workdaySet.has(d)) continue;
        const [s, e] = hoursOf(d);
        const w = partWindow(part, s, e);
        if (w) map[engineDay(d)] = { start: timeStr(w[0]), end: timeStr(w[1]) };
      }
      byKey[scheduleKey(kind, part)] = map;
    }
  }
  const latestEnd = Math.max(...days.map((d) => hoursOf(d)[1]), a.hours.end);
  return { days, workdaySet, hoursOf, byKey, latestEnd };
}

/** The engine counts days from Sunday = 0; the design from Monday = 0. */
export const toEngineDay = (d: number) => (d + 1) % 7;

export interface PlanInput {
  answers: OnboardingAnswers;
  /** null = the sample calendar. */
  events: PlanEvent[] | null;
  /** Shown in the first line, e.g. "Google Calendar". */
  calendarName?: string | null;
  timeZone: string;
  now?: Date;
  /** "Plan it differently" bumps this; it changes where repeats start. */
  seed?: number;
}

interface Instance {
  key: string;
  task: PlanTask;
  kind: Kind;
  n: number;
  k: number;
  target: number;
  pref: DayPart;
  focusy: boolean;
  /** Repeats and rituals become Habits; their weekly tasks carry a deadline. */
  habit: boolean;
  priority: SchedulingPriority;
  rankIndex: number;
}
type SchedulingPriority = SchedulingTaskPriority;

/**
 * The engine places in priority order, then shortest first. A score of
 * (area rank x 2) plus one for a short task keeps the order the person
 * tapped and lets the long focus work of an area take its slot before the
 * small tasks fragment the day.
 */
function priorityFor(score: number): SchedulingPriority {
  if (score <= 0) return "URGENT";
  if (score <= 2) return "HIGH";
  if (score <= 5) return "MEDIUM";
  return "LOW";
}

export function planWeek(input: PlanInput): WeekPlan {
  const { answers: a, timeZone } = input;
  const now = input.now ?? new Date();
  const seed = input.seed ?? 0;
  const weekStart = nextWeekStart(now, timeZone);
  const weekEnd = addCalendarDays(weekStart, 7, timeZone);
  const sample = input.events === null;
  const events = (input.events ?? [...SAMPLE_EVENTS]).filter(
    (e) => e.day >= 0 && e.day <= 6 && e.end > e.start
  );

  const table = scheduleTable(a);
  const {
    days,
    workdaySet,
    hoursOf,
    byKey: workHoursBySchedule,
    latestEnd,
  } = table;

  const prefs: SchedulingPreferences = {
    workHours: workHoursBySchedule[scheduleKey("life", "")],
    defaultScheduleId: scheduleKey("life", ""),
    workHoursBySchedule,
    bufferMinutes: a.buffer,
    maxDeepWorkPerDay: SPACING.maxDeepWork,
    minBreakMinutes: Math.min(SPACING.minBreakMinutes, a.buffer),
    autoRescheduleOnMiss: true,
    enableBodyDoubling: false,
    enableTaskBatching: true,
    hardStopTime: latestEnd >= 24 ? "23:59" : timeStr(latestEnd),
    bufferMultiplier: SPACING.bufferMultiplier,
    timeZone,
  };

  /* Busy time: calendar events, then lunch on days where it fits. */
  const busyIntervals: Record<number, [number, number][]> = {};
  const busy: CalendarBusyBlock[] = [];
  const eventsInPlay = events.filter((e) => days.includes(e.day));
  for (const e of eventsInPlay) {
    const [s, en] = hoursOf(e.day);
    if (e.end <= s || e.start >= en) continue;
    (busyIntervals[e.day] ??= []).push([
      Math.max(s, e.start),
      Math.min(en, e.end),
    ]);
    busy.push({
      id: `ev-${e.day}-${e.start}`,
      title: e.title,
      start: wallAt(weekStart, e.day, e.start, timeZone),
      end: wallAt(weekStart, e.day, e.end, timeZone),
      source: "calendar",
    });
  }
  let lunches = 0;
  if (a.lunch) {
    for (const d of days) {
      const [s, en] = hoursOf(d);
      if (!(s < 12 && en > 13)) continue;
      if ((busyIntervals[d] ?? []).some(([x, y]) => x < 13 && y > 12)) continue;
      (busyIntervals[d] ??= []).push([12, 13]);
      busy.push({
        id: `lunch-${d}`,
        title: "Lunch",
        start: wallAt(weekStart, d, 12, timeZone),
        end: wallAt(weekStart, d, 13, timeZone),
        source: "calendar",
      });
      lunches += 1;
    }
  }
  const freeOf = (d: number, extra: [number, number][] = []) => {
    const [s, en] = hoursOf(d);
    const iv = [...(busyIntervals[d] ?? []), ...extra]
      .map(([x, y]): [number, number] => [Math.max(s, x), Math.min(en, y)])
      .filter(([x, y]) => y > x)
      .sort((x, y) => x[0] - y[0]);
    let free = en - s;
    let at = s;
    for (const [x, y] of iv) {
      const from = Math.max(x, at);
      if (y > from) {
        free -= y - from;
        at = y;
      }
    }
    return Math.max(0, free);
  };
  const freeBefore = days.reduce((sum, d) => sum + freeOf(d), 0);

  /* Instances: every repeat is its own task, with a start day that spreads them. */
  const tasks = planTasks(a);
  const ranked = rankedAreas(a);
  const instances: Instance[] = [];
  for (const t of tasks) {
    const kind: Kind = areaById(t.area)?.kind ?? "life";
    const allowed = days.filter((d) => kind === "life" || workdaySet.has(d));
    if (!allowed.length) continue;
    const n = Math.min(t.rep, allowed.length);
    const rankIndex = Math.max(0, ranked.indexOf(t.area));
    const focusy = t.minutes >= FOCUS_MIN_MINUTES && kind === "work";
    const off = (seed * 0.37 + rankIndex * 0.29 + t.title.length * 0.13) % 1;
    for (let k = 0; k < n; k++) {
      const idx = Math.floor(((k + off) * allowed.length) / n) % allowed.length;
      instances.push({
        key: `${t.id}~${k}`,
        task: t,
        kind,
        n,
        k,
        target: allowed[idx],
        pref: t.when || (focusy ? a.focus : ""),
        focusy,
        habit: t.ritual || t.rep > 1,
        priority: priorityFor(rankIndex * 2 + (focusy ? 0 : 1)),
        rankIndex,
      });
    }
  }

  const toSchedulable = (
    i: Instance,
    part: DayPart,
    planFrom: Date
  ): SchedulableTask => ({
    id: i.key,
    title: i.task.title,
    assigneeId: "onboarding",
    status: "todo",
    estimatedMinutes: i.task.minutes,
    maxChunkMinutes: a.maxBlock,
    availableFrom:
      wallAt(weekStart, i.target, 0, timeZone) > planFrom
        ? wallAt(weekStart, i.target, 0, timeZone)
        : planFrom,
    ...(i.habit
      ? { deadline: wallAt(weekStart, i.target + 1, 0, timeZone) }
      : {}),
    priority: i.priority,
    energyRequired: i.focusy ? "HIGH" : "MEDIUM",
    contextTag: i.task.area,
    scheduleId: scheduleKey(i.kind, part),
    createdAt: weekStart,
  });
  const run = (
    list: Instance[],
    parts: Map<string, DayPart>,
    extraBusy: CalendarBusyBlock[]
  ) =>
    scheduleTasks({
      tasks: list.map((i) =>
        toSchedulable(i, parts.get(i.key) ?? "", weekStart)
      ),
      busyBlocks: [...busy, ...extraBusy],
      energyProfile: { windows: [] },
      prefs,
      now: weekStart,
    });
  const inWeek = (blocks: ScheduledBlock[]) =>
    blocks.every((b) => b.start >= weekStart && b.end <= weekEnd);

  /* Step 1: which part of the day each task can really have. Everyone asks for
     the part they prefer; whoever the engine cannot fit inside the week there
     is let loose on the whole day. The answer is a work schedule per task. */
  const blocksBy = (blocks: ScheduledBlock[]) => {
    const m = new Map<string, ScheduledBlock[]>();
    for (const b of blocks)
      (m.get(b.taskId) ?? m.set(b.taskId, []).get(b.taskId)!).push(b);
    return m;
  };
  const asked = new Map<string, DayPart>(instances.map((i) => [i.key, i.pref]));
  const askedBy = blocksBy(run(instances, asked, []).blocks);
  const assigned = new Map<string, DayPart>();
  const usedPref = new Set<string>();
  const taskFits = new Map<string, boolean>();
  for (const i of instances) {
    const bl = askedBy.get(i.key);
    const fits = Boolean(i.pref && bl && inWeek(bl));
    taskFits.set(i.task.id, (taskFits.get(i.task.id) ?? true) && fits);
  }
  for (const i of instances) {
    const keep = i.pref && taskFits.get(i.task.id);
    assigned.set(i.key, keep ? i.pref : "");
    if (keep) usedPref.add(i.key);
  }
  /* Step 2: the plan itself, one engine run over those schedules. This is the
     run the account's own scheduler repeats once the same tasks exist. */
  const finalBy = blocksBy(run(instances, assigned, []).blocks);
  const settled = new Map<string, ScheduledBlock[]>();
  for (const i of instances) {
    const bl = finalBy.get(i.key);
    if (bl && inWeek(bl)) settled.set(i.key, bl);
    else usedPref.delete(i.key);
  }

  /* Read the run back into days and hours in the person's zone. */
  const dayOfBlock = (b: ScheduledBlock) => {
    const iso = Number(formatInTimeZone(b.start, timeZone, "i"));
    return iso - 1;
  };
  const hourOf = (d: Date) => {
    const [h, m] = formatInTimeZone(d, timeZone, "HH:mm")
      .split(":")
      .map(Number);
    return h + m / 60;
  };
  const eventsByDay = (d: number) =>
    eventsInPlay.filter((e) => e.day === d).sort((x, y) => x.start - y.start);
  const rankNames = ranked;
  const placed: PlannedItem[] = [];
  for (const i of instances) {
    const bl = settled.get(i.key);
    if (!bl) continue;
    for (const b of bl) {
      const day = dayOfBlock(b);
      const start = hourOf(b.start);
      const end = hourOf(b.end);
      const minutes = Math.round((b.end.getTime() - b.start.getTime()) / 60000);
      const prev = eventsByDay(day).find(
        (e) =>
          Math.abs(e.end + a.buffer / 60 - start) < 0.26 ||
          Math.abs(e.end - start) < 0.01
      );
      const next = eventsByDay(day).find((e) => e.start >= end - 0.01);
      let why: string;
      if (i.n > 1)
        why = `${i.n}× this week, spread out so no two land on the same day.`;
      else if (i.focusy && usedPref.has(i.key))
        why = `Your ${partName(a.focus)} focus time${next ? `, and nothing is booked until ${hhmm(next.start)}` : ""}.`;
      else if (usedPref.has(i.key) && i.task.when)
        why = `${partName(i.task.when).replace(/^./, (c) => c.toUpperCase())}s suit this one best.`;
      else if (prev && a.buffer)
        why = `Right after ${prev.title}, with ${a.buffer} min to reset first.`;
      else if (i.rankIndex < 3)
        why = `${areaById(i.task.area)?.name ?? "This area"} is priority #${i.rankIndex + 1}, so it goes early.`;
      else why = `The first free ${dur(minutes)} on ${WEEKDAY_LONG[day]}.`;
      placed.push({
        key: `${i.key}~${b.chunkIndex}`,
        id: i.task.id,
        title: i.task.title,
        area: i.task.area,
        minutes,
        day,
        start,
        end,
        part: b.chunkCount > 1 ? `${b.chunkIndex + 1}/${b.chunkCount}` : "",
        why,
      });
    }
  }
  placed.sort((x, y) => x.day - y.day || x.start - y.start);
  const left: LeftItem[] = instances
    .filter((i) => !settled.has(i.key))
    .map((i) => ({
      id: i.task.id,
      title: i.task.title,
      area: i.task.area,
      minutes: i.task.minutes,
    }));

  /* The numbers, from what the engine did. */
  const plannedMin = placed.reduce((s, p) => s + p.minutes, 0);
  const byArea: Record<string, number> = {};
  for (const p of placed) byArea[p.area] = (byArea[p.area] ?? 0) + p.minutes;
  const freeAfter = Math.max(
    0,
    days.reduce(
      (sum, d) =>
        sum +
        freeOf(
          d,
          placed
            .filter((p) => p.day === d)
            .map((p): [number, number] => [p.start, p.end])
        ),
      0
    )
  );
  const perDay = new Map<string, number>();
  let maxRepeatPerDay = placed.length ? 1 : 0;
  for (const p of placed) {
    const inst = instances.find((i) => p.key.startsWith(i.key + "~"));
    if (!inst || inst.n < 2) continue;
    const key = `${inst.task.id}@${p.day}`;
    const c = (perDay.get(key) ?? 0) + 1;
    perDay.set(key, c);
    if (c > maxRepeatPerDay) maxRepeatPerDay = c;
  }
  const splitTasks = [...settled.values()].filter((bl) => bl.length > 1).length;
  const repeaters = tasks.filter((t) => t.rep > 1);
  const stats: PlanStats = {
    eventCount: eventsInPlay.length,
    freeBefore,
    freeAfter,
    planned: plannedMin / 60,
    lunches,
    instances: instances.length,
    splitTasks,
    maxRepeatPerDay,
    byArea,
  };

  const steps: [string, string][] = [
    [
      "Reading your calendar",
      sample || !input.calendarName
        ? `Sample calendar, ${stats.eventCount} events`
        : `${stats.eventCount} events next week from ${input.calendarName}`,
    ],
    [
      "Finding free time",
      `${durH(freeBefore)} open across ${days.length} days`,
    ],
    [
      a.lunch ? "Keeping lunch free" : "Using the whole day",
      a.lunch
        ? `12:00 to 13:00 blocked on ${lunches} day${lunches === 1 ? "" : "s"}`
        : "No lunch block, as you asked",
    ],
    [
      "Ordering by what matters",
      rankNames
        .slice(0, 3)
        .map((c) => areaById(c)?.name ?? c)
        .join(", then "),
    ],
    [
      `Long work in your ${partName(a.focus)}s`,
      stats.splitTasks
        ? `Blocks up to ${dur(a.maxBlock)}, ${stats.splitTasks} longer task${stats.splitTasks === 1 ? "" : "s"} split into parts`
        : `Blocks up to ${dur(a.maxBlock)}, nothing needed splitting`,
    ],
    [
      "Spreading the repeats",
      repeaters.length
        ? repeaters
            .slice(0, 2)
            .map((t) => `${t.title} ${t.rep}×`)
            .join(", ") +
          (repeaters.length > 2 ? ` and ${repeaters.length - 2} more` : "") +
          (maxRepeatPerDay <= 1
            ? ", never twice a day"
            : `, up to ${maxRepeatPerDay} on one day when the week is full`)
        : "Nothing repeats this week",
    ],
    [
      `Placing ${stats.instances} task${stats.instances === 1 ? "" : "s"}`,
      left.length
        ? `${settled.size} placed, ${left.length} wait for the week after`
        : `All ${settled.size} placed, ${durH(freeAfter)} still free`,
    ],
  ];

  const planDays: PlanDay[] = days.map((d) => {
    const date = addCalendarDays(weekStart, d, timeZone);
    return {
      day: d,
      short: WEEKDAY_SHORT[d],
      long: WEEKDAY_LONG[d],
      n: Number(formatInTimeZone(date, timeZone, "d")),
      mon: formatInTimeZone(date, timeZone, "MMM"),
    };
  });
  const lo = Math.min(a.hours.start, ...(a.weekends ? [a.daysOff.start] : []));
  const hi = Math.max(a.hours.end, ...(a.weekends ? [a.daysOff.end] : []));

  return {
    weekStart: formatInTimeZone(weekStart, timeZone, "yyyy-MM-dd"),
    days: planDays,
    events: eventsInPlay,
    placed,
    left,
    stats,
    steps,
    range: { lo, hi },
    source: sample ? "sample" : "calendar",
  };
}
