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
/** Earliest and latest start, minutes after local midnight. */
const EARLIEST = 9 * 60;
const LATEST = 15 * 60;
const FALLBACK_START = 10 * 60;
/** Never earlier than this after `now`, so the person sees it ahead of them. */
const LEAD_MINUTES = 30;

export interface DemoSlot {
  taskStart: Date;
  taskEnd: Date;
  meetingStart: Date;
  meetingEnd: Date;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Where the demo lands: today at the next half hour at least 30 minutes away
 * when that is between 09:00 and 15:00 local time, otherwise the next weekday
 * at 10:00. Pure: the clock and the zone come in as arguments.
 */
export function demoSlot(now: Date, zone: string): DemoSlot {
  const [date, hh, mm] = formatInTimeZone(now, zone, "yyyy-MM-dd HH mm").split(
    " "
  );
  const minutes = Number(hh) * 60 + Number(mm);
  let day = date;
  let start = Math.ceil((minutes + LEAD_MINUTES) / 30) * 30;
  if (start < EARLIEST) start = FALLBACK_START;
  else if (start > LATEST) {
    day = shiftDay(day, 1);
    start = FALLBACK_START;
  }
  // Saturday and Sunday are skipped: nobody has a sync on one.
  for (;;) {
    const weekday = newDate(`${day}T12:00:00.000Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) break;
    day = shiftDay(day, 1);
    start = FALLBACK_START;
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

type Db = Pick<typeof prisma, "task" | "project" | "userSettings">;

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

  const [settings, project] = await Promise.all([
    db.userSettings.findUnique({
      where: { userId },
      select: { timeZone: true },
    }),
    db.project.findFirst({
      where: { userId, isSample: true },
      select: { id: true },
    }),
  ]);
  const zone = validZone(input.timeZone || settings?.timeZone);
  const slot = demoSlot(input.now ?? newDate(), zone);
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
      isAutoScheduled: false,
      scheduledStart: slot.meetingStart,
      scheduledEnd: slot.meetingEnd,
    },
  });
  return { created: true };
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
      isAutoScheduled: true,
      scheduledStart: true,
      scheduledEnd: true,
    },
  });
  const task = rows.find((r) => r.isAutoScheduled);
  const meeting = rows.find((r) => !r.isAutoScheduled);
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
