import { pageBlocksFromText } from "@/services/pages/page-text-blocks";
import { partsCreateData } from "@/services/tasks/subtasks";
import {
  PageAuthor,
  type Prisma,
  SchedulingTaskPriority,
} from "@prisma/client";

import { formatInTimeZone, fromZonedTime, newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import {
  SAMPLE_DAYS,
  SAMPLE_DOC_TITLE,
  SAMPLE_HABIT_NOTE,
  type SampleTask,
  type SampleUse,
  isSampleUse,
  sampleDocMarkdown,
} from "./sample-content";

/**
 * First-run examples. One transaction creates a project, a handful of tasks,
 * a "Start here" document and a habit, every row flagged `isSample`; another
 * removes exactly the flagged rows. The two entry points are
 * `POST` / `DELETE /api/onboarding/sample` (docs/connector-api.md).
 *
 * Why the rows look the way they do:
 *  - They are written with the same helpers the rest of the product uses
 *    (`partsCreateData` for subtasks, `pageBlocksFromText` for the document's
 *    blocks). `createPage` and the task routes talk to the global client and
 *    so cannot join a transaction; the rows below have the same shape.
 *  - Examples are never auto-scheduled, so they do not count toward the Free
 *    plan's monthly auto-schedule allowance, and `canCreateHabit` skips
 *    `isSample` habits.
 *  - `User.sampleSeededAt` is claimed first, inside the transaction, so a
 *    second call (or a concurrent one) creates nothing. It stays set after
 *    "Clear examples", so clearing is final. The migration stamps every
 *    account that already exists, which is how existing users are never given
 *    examples.
 */

type Db = Pick<typeof prisma, "$transaction">;

export interface SampleCounts {
  tasks: number;
  projects: number;
  pages: number;
  habits: number;
}

export interface SeedResult {
  /** False when this account has already been through seeding. */
  created: boolean;
  use: SampleUse | null;
  projectId: string | null;
  pageId: string | null;
  counts: SampleCounts;
}

const NONE: SampleCounts = { tasks: 0, projects: 0, pages: 0, habits: 0 };

/** The sample's use: the first valid pick, else Work. */
export function primaryUse(uses: readonly unknown[] | undefined): SampleUse {
  return (uses ?? []).find(isSampleUse) ?? "work";
}

/** `yyyy-MM-dd` for `offset` days from the `today` string, DST-proof. */
export function shiftDay(today: string, offset: number): string {
  const d = newDate(`${today}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function validZone(zone: string | null | undefined): string {
  if (!zone) return "UTC";
  try {
    formatInTimeZone(newDate(), zone, "yyyy-MM-dd");
    return zone;
  } catch {
    return "UTC";
  }
}

const PRIORITY: Record<
  NonNullable<SampleTask["priority"]>,
  SchedulingTaskPriority
> = {
  high: SchedulingTaskPriority.HIGH,
  medium: SchedulingTaskPriority.MEDIUM,
  low: SchedulingTaskPriority.LOW,
};

/** One sample task as `task.create` data (workspace and project added by the caller). */
export function taskData(
  task: SampleTask,
  today: string,
  zone: string
): Omit<Prisma.TaskUncheckedCreateInput, "userId" | "workspaceId"> {
  const day = task.due === undefined ? null : shiftDay(today, task.due);
  const start =
    day && task.at ? fromZonedTime(`${day}T${task.at}:00`, zone) : null;
  return {
    title: task.title,
    description: task.note ?? null,
    status: "todo",
    estimatedMinutes: task.estimate,
    duration: task.estimate,
    priorityLevel: task.priority
      ? PRIORITY[task.priority]
      : SchedulingTaskPriority.MEDIUM,
    // A due day is stored as UTC midnight of that day, as the task routes do.
    dueDate: day ? newDate(`${day}T00:00:00.000Z`) : null,
    scheduledStart: start,
    scheduledEnd: start
      ? new Date(start.getTime() + task.estimate * 60_000)
      : null,
    isAutoScheduled: false,
    isSample: true,
  };
}

export async function seedSampleData(
  input: {
    userId: string;
    workspaceId: string;
    uses?: readonly unknown[];
    timeZone?: string | null;
    now?: Date;
  },
  db: Db = prisma
): Promise<SeedResult> {
  const use = primaryUse(input.uses);
  const day = SAMPLE_DAYS[use];
  const now = input.now ?? newDate();

  return db.$transaction(async (tx) => {
    const claimed = await tx.user.updateMany({
      where: { id: input.userId, sampleSeededAt: null },
      data: { sampleSeededAt: now },
    });
    if (claimed.count === 0) {
      return {
        created: false,
        use: null,
        projectId: null,
        pageId: null,
        counts: NONE,
      };
    }

    const settings = await tx.userSettings.findUnique({
      where: { userId: input.userId },
      select: { timeZone: true },
    });
    const zone = validZone(input.timeZone || settings?.timeZone);
    const today = formatInTimeZone(now, zone, "yyyy-MM-dd");
    const owner = { userId: input.userId, workspaceId: input.workspaceId };

    const project = await tx.project.create({
      data: {
        name: day.project.name,
        description: day.project.description,
        status: "active",
        isSample: true,
        ...owner,
      },
      select: { id: true },
    });

    for (const task of day.tasks) {
      await tx.task.create({
        data: {
          ...taskData(task, today, zone),
          ...owner,
          projectId: project.id,
          parts: partsCreateData(
            (task.subtasks ?? []).map((title) => ({ title, done: false }))
          ),
        },
      });
    }

    const blocks = pageBlocksFromText(
      sampleDocMarkdown(use),
      "markdown",
      PageAuthor.HUMAN
    );
    const page = await tx.page.create({
      data: {
        title: SAMPLE_DOC_TITLE,
        createdBy: PageAuthor.HUMAN,
        position: 1024,
        isSample: true,
        projectId: project.id,
        ...owner,
        blocks: {
          create: blocks.map((b) => ({
            id: b.id,
            type: b.type,
            content: b.content,
            position: b.position,
            createdBy: PageAuthor.HUMAN,
          })),
        },
      },
      select: { id: true },
    });

    await tx.habit.create({
      data: {
        title: day.habit.title,
        description: SAMPLE_HABIT_NOTE,
        at: day.habit.at,
        estimatedMinutes: day.habit.minutes,
        quota: day.habit.perWeek,
        targetOccurrencesPerWeek: day.habit.perWeek,
        daysOfWeek: [...day.habit.daysOfWeek],
        projectId: project.id,
        isSample: true,
        ...owner,
      },
    });

    return {
      created: true,
      use,
      projectId: project.id,
      pageId: page.id,
      counts: {
        tasks: day.tasks.length,
        projects: 1,
        pages: 1,
        habits: 1,
      },
    };
  });
}

/**
 * Removes every example this person still has. Anything they added around
 * the examples stays: a task of their own inside the sample project simply
 * leaves the project. Tasks a habit materialised for its week go with the
 * habit (the habit link would otherwise refuse the delete).
 */
export async function clearSampleData(
  input: { userId: string },
  db: Db = prisma
): Promise<SampleCounts> {
  const userId = input.userId;
  return db.$transaction(async (tx) => {
    const habits = await tx.habit.findMany({
      where: { userId, isSample: true },
      select: { id: true },
    });
    const habitIds = habits.map((h) => h.id);
    const tasks = await tx.task.deleteMany({
      where: {
        userId,
        OR: [
          { isSample: true },
          ...(habitIds.length ? [{ habitId: { in: habitIds } }] : []),
        ],
      },
    });
    const removedHabits = await tx.habit.deleteMany({
      where: { userId, isSample: true },
    });
    const pages = await tx.page.deleteMany({
      where: { userId, isSample: true },
    });
    const projects = await tx.project.deleteMany({
      where: { userId, isSample: true },
    });
    return {
      tasks: tasks.count,
      projects: projects.count,
      pages: pages.count,
      habits: removedHabits.count,
    };
  });
}

export interface SampleStatus {
  /** Any example is still there, so the banner and the Data row show. */
  present: boolean;
  counts: SampleCounts;
}

export async function sampleStatus(userId: string): Promise<SampleStatus> {
  const [tasks, projects, pages, habits] = await Promise.all([
    prisma.task.count({ where: { userId, isSample: true } }),
    prisma.project.count({ where: { userId, isSample: true } }),
    prisma.page.count({ where: { userId, isSample: true } }),
    prisma.habit.count({ where: { userId, isSample: true } }),
  ]);
  return {
    present: tasks + projects + pages + habits > 0,
    counts: { tasks, projects, pages, habits },
  };
}
