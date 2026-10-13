import { addCalendarDays, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { UNDO_WINDOW_DAYS } from "./constants";

const LOG_SOURCE = "ops-retention";

/** How long an action is kept after it stops being undoable. */
export const ACTION_LOG_RETENTION_DAYS = 30;

/**
 * How long a trial record outlives its account (Privacy Notice §3.7: "two
 * years after the trial ended"). The record holds only a keyed hash.
 */
export const TRIAL_RECORD_RETENTION_DAYS = 730;

/**
 * Deletes trial records whose account is gone and whose trial ended more than
 * two years ago. A record whose account still exists is kept with it.
 */
export async function pruneOrphanTrialGrants(now: Date = newDate()) {
  const cutoff = addCalendarDays(now, -TRIAL_RECORD_RETENTION_DAYS);
  const { count } = await prisma.trialGrant.deleteMany({
    where: { userId: null, endsAt: { lt: cutoff } },
  });
  if (count) {
    logger.info("Pruned trial records", { count }, LOG_SOURCE);
  }
  return count;
}

/**
 * Deletes action-log rows 30 days past their undo window, then runs older
 * than that with no actions left. Runs from the worker's hourly sweep.
 */
export async function pruneAgentActionLog(now: Date = newDate()) {
  const cutoff = addCalendarDays(now, -ACTION_LOG_RETENTION_DAYS);
  // Rows without an undo window (reads are never logged, but irreversible
  // and no-op writes are) age out from creation instead.
  const createdCutoff = addCalendarDays(cutoff, -UNDO_WINDOW_DAYS);

  const actions = await prisma.agentAction.deleteMany({
    where: {
      OR: [
        { undoableUntil: { lt: cutoff } },
        { undoableUntil: null, createdAt: { lt: createdCutoff } },
      ],
    },
  });

  const oldRuns = await prisma.agentRun.findMany({
    where: { createdAt: { lt: createdCutoff } },
    select: { id: true },
  });
  let runs = 0;
  if (oldRuns.length) {
    const stillReferenced = await prisma.agentAction.findMany({
      where: { runId: { in: oldRuns.map((run) => run.id) } },
      select: { runId: true },
    });
    const keep = new Set(stillReferenced.map((row) => row.runId));
    const removable = oldRuns
      .map((run) => run.id)
      .filter((id) => !keep.has(id));
    if (removable.length) {
      runs = (
        await prisma.agentRun.deleteMany({ where: { id: { in: removable } } })
      ).count;
    }
  }

  if (actions.count || runs) {
    logger.info(
      "Pruned agent action log",
      { actions: actions.count, runs },
      LOG_SOURCE
    );
  }
  return { actions: actions.count, runs };
}
