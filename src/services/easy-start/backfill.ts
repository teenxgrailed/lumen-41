import type { Prisma } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { ALWAYS_EASY_START } from "@/lib/feature-flags-keys";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { publishRealtimeEvent } from "@/lib/realtime/publish";

import { simplifiedLine } from "./rules";
import { simplifyTask } from "./service";

const LOG_SOURCE = "easy-start-backfill";

/**
 * Existing open tasks with no entry get one, once. A small batch per person
 * per run keeps the work (and the AI use, which is metered like any other)
 * gentle: the same rules as a new task apply, so Free without a key gets the
 * fixed entry, Free with its own key and Pro get the AI one.
 */
export const BACKFILL_PER_USER = 25;
const BACKFILL_USERS_PER_PAGE = 50;
const BACKFILL_MAX_PAGES = 2;

/** The person has not chosen "auto": suggest and off never backfill. */
const notAutoMode: Prisma.UserWhereInput = {
  NOT: {
    userSettings: { is: { easyStartMode: { in: ["off", "suggest"] } } },
  },
};

const noEntry: Prisma.TaskWhereInput = {
  OR: [{ entry: null }, { entry: "" }],
};

const candidateTasks: Prisma.TaskWhereInput = {
  status: "todo",
  isArchived: false,
  trashedAt: null,
  somedayAt: null,
  isSample: false,
  isRecurring: false,
  recurrenceMasterId: null,
  habitId: null,
  externalTaskId: null,
  simplifiedAt: null,
  AND: [noEntry],
};

/** Where the person scan resumes; rotates over runs, like the sweep's. */
let userCursor: string | undefined;

/** For tests: start the person scan from the beginning. */
export function resetBackfillCursor() {
  userCursor = undefined;
}

export interface BackfillResult {
  skipped: "flag_off" | null;
  tasks: number;
  people: number;
}

/**
 * One backfill run: up to `BACKFILL_PER_USER` tasks for each of a page of
 * people (resuming where the last run stopped). Each task goes through the same
 * `simplifyTask` as a new one (reason `backfill`), so each change is a
 * `task.simplify` action, undoable from the history; a person sees one summed
 * line, not one per task. A task that is skipped is stamped, so it is never
 * tried again.
 */
export async function runEasyStartBackfill(
  now: Date = newDate()
): Promise<BackfillResult> {
  const flag = await prisma.featureFlag.findUnique({
    where: { key: ALWAYS_EASY_START },
    select: { enabled: true },
  });
  if (!flag?.enabled) return { skipped: "flag_off", tasks: 0, people: 0 };

  let tasks = 0;
  let people = 0;
  for (let page = 0; page < BACKFILL_MAX_PAGES; page += 1) {
    const rows = await prisma.task.groupBy({
      by: ["userId"],
      where: {
        ...candidateTasks,
        userId: userCursor ? { gt: userCursor } : { not: null },
        user: notAutoMode,
      },
      orderBy: { userId: "asc" },
      take: BACKFILL_USERS_PER_PAGE,
    });
    for (const row of rows) {
      if (!row.userId) continue;
      try {
        const done = await backfillUser(row.userId, now);
        tasks += done;
        if (done > 0) people += 1;
      } catch (error) {
        logger.warn(
          "Easy start backfill failed for a person",
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        );
      }
    }
    if (rows.length < BACKFILL_USERS_PER_PAGE) {
      userCursor = undefined;
      break;
    }
    userCursor = rows[rows.length - 1].userId ?? undefined;
  }
  return { skipped: null, tasks, people };
}

async function backfillUser(userId: string, now: Date): Promise<number> {
  const batch = await prisma.task.findMany({
    where: { ...candidateTasks, userId },
    select: { id: true },
    orderBy: { id: "asc" },
    take: BACKFILL_PER_USER,
  });
  let simplified = 0;
  for (const { id } of batch) {
    try {
      const outcome = await simplifyTask({
        taskId: id,
        reason: "backfill",
        now,
        quiet: true,
      });
      if (outcome.status === "simplified") simplified += 1;
      // The mode went off mid-batch: stop for this person.
      if (outcome.status === "skipped" && outcome.why === "off") break;
    } catch (error) {
      logger.warn(
        "Easy start backfill of a task failed",
        {
          taskId: id,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
    }
  }
  if (simplified > 0) {
    try {
      await publishRealtimeEvent(userId, "easy-start", {
        message: simplifiedLine({ kind: "backfill", count: simplified }),
      });
    } catch {
      // The notice is a courtesy; the changes are already logged and undoable.
    }
  }
  return simplified;
}
