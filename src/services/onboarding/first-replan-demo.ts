import { SchedulingTaskPriority } from "@prisma/client";

import { formatInTimeZone, fromZonedTime, newDate } from "@/lib/date-utils";
import {
  DEMO_MEETING_TITLE,
  DEMO_TASK_TITLE,
  FIRST_REPLAN_DEMO_SOURCE,
  type FirstReplanItem,
  type FirstReplanState,
} from "@/lib/onboarding/first-replan";
import { prisma } from "@/lib/prisma";

import { shiftDay, validZone } from "./sample-service";

/**
 * The demo behind "first replan": two tasks flagged `isSample`, one of them a
 * fixed "meeting" that sits on top of an auto-scheduled "task". Replanning
 * moves the task, because the scheduler treats the meeting as busy time.
 *
 * Why these rows are safe:
 *  - `source` marks them, so "Remove the demo" deletes exactly these two and a
 *    renamed title cannot hide one.
 *  - `skipSync` keeps them out of task sync, and `pushTaskBlock` refuses
 *    `source = FIRST_REPLAN_DEMO_SOURCE`, so neither reaches an external
 *    calendar even for someone who turned "push tasks to calendar" on.
 *  - They are also `isSample`, so "Clear examples" and the Free plan limits
 *    treat them like the rest of the sample day.
 */

const TASK_MINUTES = 60;
const MEETING_MINUTES = 45;
/** The meeting starts this long after the task does, so they overlap. */
const MEETING_OFFSET_MINUTES = 15;
/** The scheduler's default gap between two blocks. */
const BUFFER_MINUTES = 15;
/**
 * The default window when the person has no work hours: earliest and latest
 * start, minutes after local midnight, on weekdays.
 */
const DEFAULT_EARLIEST = 9 * 60;
const DEFAULT_LATEST = 15 * 60;
/** Where the default work day closes. */
const DEFAULT_END = 17 * 60;
const DEFAULT_DAYS = [1, 2, 3, 4, 5];
/**
 * A demo that starts a day waits this long after the window opens. Together
 * with the 15 minute overlap it leaves less than an hour between the start of
 * the day and the meeting, so the 60 minute task cannot be put before the
 * meeting: the only way to resolve the overlap is to move it after.
 */
const DAY_START_OFFSET = 30;
/**
 * Today's demo starts at least this long after `now`. The meeting start is
 * then under an hour away (start < now + 45, meeting = start + 15), which has
 * the same effect: no room for the task before the meeting.
 */
const LEAD_MINUTES = 15;

export interface DemoSlot {
  taskStart: Date;
  taskEnd: Date;
  meetingStart: Date;
  meetingEnd: Date;
}

/** The person's work hours, when they have set them. */
export interface DemoHours {
  /** Hour of day the work day opens and closes, 0 to 24. */
  startHour: number;
  endHour: number;
  /** Days of the week the person works, 0 = Sunday. Empty or missing: Mon-Fri. */
  days?: number[];
}

interface DemoWindow {
  /** Minutes after local midnight the work day closes. */
  end: number;
  earliest: number;
  latest: number;
  fallback: number;
  days: number[];
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The window a demo may start in: the person's work hours when they fit the
 * demo (the task has to be able to land after the meeting, inside the day),
 * otherwise the default window.
 */
export function demoWindow(hours?: DemoHours | null): DemoWindow {
  if (hours) {
    const earliest = hours.startHour * 60;
    const afterMeeting =
      MEETING_OFFSET_MINUTES + MEETING_MINUTES + BUFFER_MINUTES + TASK_MINUTES;
    const latest = Math.floor((hours.endHour * 60 - afterMeeting) / 30) * 30;
    const valid =
      Number.isInteger(hours.startHour) &&
      Number.isInteger(hours.endHour) &&
      hours.startHour >= 0 &&
      hours.endHour <= 24 &&
      latest >= earliest + DAY_START_OFFSET;
    if (valid) {
      const days = (hours.days ?? []).filter(
        (d) => Number.isInteger(d) && d >= 0 && d <= 6
      );
      return {
        end: hours.endHour * 60,
        earliest,
        latest,
        fallback: earliest + DAY_START_OFFSET,
        days: days.length ? days : DEFAULT_DAYS,
      };
    }
  }
  return {
    end: DEFAULT_END,
    earliest: DEFAULT_EARLIEST,
    latest: DEFAULT_LATEST,
    fallback: DEFAULT_EARLIEST + DAY_START_OFFSET,
    days: DEFAULT_DAYS,
  };
}

/**
 * Where the demo lands: today at the next half hour at least 15 minutes away
 * when that is inside the person's work hours (09:00 to 15:00 when they have
 * none), otherwise the next work day, 30 minutes after the day opens. Every
 * time is later than `now`. Pure: the clock and the zone come in as arguments.
 */
export function demoSlot(
  now: Date,
  zone: string,
  hours?: DemoHours | null
): DemoSlot {
  const win = demoWindow(hours);
  const [date, hh, mm] = formatInTimeZone(now, zone, "yyyy-MM-dd HH mm").split(
    " "
  );
  const minutes = Number(hh) * 60 + Number(mm);
  let day = date;
  let start = Math.ceil((minutes + LEAD_MINUTES) / 30) * 30;
  if (start < win.earliest) start = win.fallback;
  else if (start > win.latest) {
    day = shiftDay(day, 1);
    start = win.fallback;
  }
  // A day off is skipped: nobody has a sync on one.
  for (let guard = 0; guard < 8; guard++) {
    const weekday = newDate(`${day}T12:00:00.000Z`).getUTCDay();
    if (win.days.includes(weekday)) break;
    day = shiftDay(day, 1);
    start = win.fallback;
  }
  const at = (m: number) =>
    fromZonedTime(`${day}T${pad(Math.floor(m / 60))}:${pad(m % 60)}:00`, zone);
  return {
    taskStart: at(start),
    taskEnd: at(start + TASK_MINUTES),
    meetingStart: at(start + MEETING_OFFSET_MINUTES),
    meetingEnd: at(start + MEETING_OFFSET_MINUTES + MEETING_MINUTES),
  };
}

type Interval = { start: Date; end: Date };

/**
 * The first free gap for the demo task after the meeting: it starts at least
 * the scheduler's buffer after `after` (the meeting's end) and after `now`, on
 * a quarter hour, lasts the task's full length, sits inside a work day and
 * touches nothing in `busy` (other tasks and calendar events). Null when
 * three weeks of work days hold no such gap. Pure.
 */
export function freeGapAfter(input: {
  after: Date;
  now: Date;
  zone: string;
  hours?: DemoHours | null;
  busy: Interval[];
}): { start: Date; end: Date } | null {
  const { after, now, zone, hours, busy } = input;
  const win = demoWindow(hours);
  const step = 15 * 60_000;
  const length = TASK_MINUTES * 60_000;
  const from = Math.max(
    after.getTime() + BUFFER_MINUTES * 60_000,
    now.getTime()
  );
  let at = Math.ceil(from / step) * step;
  const limit = at + 21 * 24 * 60 * 60_000;
  for (; at <= limit; at += step) {
    const [day, hh, mm] = formatInTimeZone(
      new Date(at),
      zone,
      "yyyy-MM-dd HH mm"
    ).split(" ");
    const minute = Number(hh) * 60 + Number(mm);
    if (!win.days.includes(newDate(`${day}T12:00:00.000Z`).getUTCDay()))
      continue;
    if (minute < win.earliest || minute + TASK_MINUTES > win.end) continue;
    const slot = { start: new Date(at), end: new Date(at + length) };
    if (!busy.some((b) => overlaps(slot, b))) return slot;
  }
  return null;
}

/** The work hours on the person's auto-schedule settings, if there are any. */
export function hoursFromSettings(
  row: {
    workHourStart: number;
    workHourEnd: number;
    workDays: string;
  } | null
): DemoHours | null {
  if (!row) return null;
  let days: number[] = [];
  try {
    const parsed: unknown = JSON.parse(row.workDays);
    if (Array.isArray(parsed)) {
      days = parsed.filter((d): d is number => typeof d === "number");
    }
  } catch {
    days = [];
  }
  return { startHour: row.workHourStart, endHour: row.workHourEnd, days };
}

type Db = Pick<
  typeof prisma,
  "task" | "project" | "userSettings" | "autoScheduleSettings"
>;

export interface DemoSeedResult {
  created: boolean;
}

/** Creates the two demo tasks, once. A second call changes nothing. */
export async function seedFirstReplanDemo(
  input: {
    userId: string;
    workspaceId: string;
    timeZone?: string | null;
    now?: Date;
  },
  db: Db = prisma
): Promise<DemoSeedResult> {
  const { userId, workspaceId } = input;
  const existing = await db.task.findFirst({
    where: { userId, source: FIRST_REPLAN_DEMO_SOURCE },
    select: { id: true },
  });
  if (existing) return { created: false };

  const [settings, hours, project] = await Promise.all([
    db.userSettings.findUnique({
      where: { userId },
      select: { timeZone: true },
    }),
    db.autoScheduleSettings.findUnique({
      where: { userId },
      select: { workHourStart: true, workHourEnd: true, workDays: true },
    }),
    db.project.findFirst({
      where: { userId, isSample: true },
      select: { id: true },
    }),
  ]);
  const zone = validZone(input.timeZone || settings?.timeZone);
  const slot = demoSlot(input.now ?? newDate(), zone, hoursFromSettings(hours));
  const common = {
    status: "todo",
    priorityLevel: SchedulingTaskPriority.MEDIUM,
    userId,
    assigneeId: userId,
    workspaceId,
    projectId: project?.id ?? null,
    isSample: true,
    skipSync: true,
    source: FIRST_REPLAN_DEMO_SOURCE,
  };

  await db.task.create({
    data: {
      ...common,
      title: DEMO_TASK_TITLE,
      description:
        "A demo task. Needt moves it when something lands on top of it.",
      estimatedMinutes: TASK_MINUTES,
      duration: TASK_MINUTES,
      isAutoScheduled: true,
      scheduledStart: slot.taskStart,
      scheduledEnd: slot.taskEnd,
    },
  });
  await db.task.create({
    data: {
      ...common,
      title: DEMO_MEETING_TITLE,
      description:
        "A demo meeting. It is not on any calendar. Remove the demo any time.",
      estimatedMinutes: MEETING_MINUTES,
      duration: MEETING_MINUTES,
      // The scheduler only treats a locked auto-scheduled task (or a calendar
      // event) as busy time. Locked, the meeting stays where it is and the
      // demo task has to move around it: that is the whole demo.
      isAutoScheduled: true,
      scheduleLocked: true,
      scheduledStart: slot.meetingStart,
      scheduledEnd: slot.meetingEnd,
    },
  });
  return { created: true };
}

/**
 * Where "Replan my day" moves the demo task: the first free gap after the
 * meeting, checked against everything else on the person's day. Null when
 * there is no demo, nothing overlaps, or no gap exists.
 */
export async function firstReplanTarget(
  userId: string,
  now: Date = newDate(),
  db: Pick<
    typeof prisma,
    "task" | "autoScheduleSettings" | "calendarEvent" | "userSettings"
  > = prisma
): Promise<{ taskId: string; start: Date; end: Date } | null> {
  const demo = await firstReplanState(userId, db);
  if (!demo?.conflict) return null;
  const horizon = new Date(now.getTime() + 22 * 24 * 60 * 60_000);
  const [hours, settings, tasks, events] = await Promise.all([
    db.autoScheduleSettings.findUnique({
      where: { userId },
      select: { workHourStart: true, workHourEnd: true, workDays: true },
    }),
    db.userSettings.findUnique({
      where: { userId },
      select: { timeZone: true },
    }),
    db.task.findMany({
      where: {
        userId,
        isArchived: false,
        status: { notIn: ["completed", "done"] },
        id: { not: demo.task.id },
        scheduledEnd: { gt: now },
        scheduledStart: { lt: horizon },
      },
      select: { scheduledStart: true, scheduledEnd: true },
    }),
    db.calendarEvent.findMany({
      where: {
        feed: { userId, enabled: true },
        archivedAt: null,
        allDay: false,
        end: { gt: now },
        start: { lt: horizon },
      },
      select: { start: true, end: true },
    }),
  ]);
  const busy: Interval[] = [
    ...tasks.flatMap((t) =>
      t.scheduledStart && t.scheduledEnd
        ? [{ start: t.scheduledStart, end: t.scheduledEnd }]
        : []
    ),
    ...events,
  ];
  const slot = freeGapAfter({
    after: new Date(demo.meeting.end),
    now,
    zone: validZone(settings?.timeZone),
    hours: hoursFromSettings(hours),
    busy,
  });
  return slot ? { taskId: demo.task.id, ...slot } : null;
}

/** Removes exactly the demo rows. Everything else on the account stays. */
export async function clearFirstReplanDemo(
  userId: string,
  db: Pick<typeof prisma, "task"> = prisma
): Promise<number> {
  const { count } = await db.task.deleteMany({
    where: { userId, source: FIRST_REPLAN_DEMO_SOURCE },
  });
  return count;
}

export function overlaps(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date }
): boolean {
  return a.start < b.end && b.start < a.end;
}

/** What Today shows: null when there is no demo (or it was removed). */
export async function firstReplanState(
  userId: string,
  db: Pick<typeof prisma, "task"> = prisma
): Promise<FirstReplanState | null> {
  const rows = await db.task.findMany({
    where: { userId, source: FIRST_REPLAN_DEMO_SOURCE },
    select: {
      id: true,
      title: true,
      scheduleLocked: true,
      scheduledStart: true,
      scheduledEnd: true,
    },
  });
  const task = rows.find((r) => !r.scheduleLocked);
  const meeting = rows.find((r) => r.scheduleLocked);
  if (
    !task?.scheduledStart ||
    !task.scheduledEnd ||
    !meeting?.scheduledStart ||
    !meeting.scheduledEnd
  ) {
    return null;
  }
  const item = (r: typeof task, s: Date, e: Date): FirstReplanItem => ({
    id: r.id,
    title: r.title,
    start: s.toISOString(),
    end: e.toISOString(),
  });
  return {
    task: item(task, task.scheduledStart, task.scheduledEnd),
    meeting: item(meeting, meeting.scheduledStart, meeting.scheduledEnd),
    conflict: overlaps(
      { start: task.scheduledStart, end: task.scheduledEnd },
      { start: meeting.scheduledStart, end: meeting.scheduledEnd }
    ),
  };
}
