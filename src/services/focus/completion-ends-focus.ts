import { FocusSessionPhase } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import {
  earlyLine,
  earlyMinutes,
  effectiveFullTime,
} from "@/lib/needt3/full-time";
import { prisma } from "@/lib/prisma";
import { publishRealtimeEvent } from "@/lib/realtime/publish";

import { finalizeSession } from "./focusSession";

const LOG_SOURCE = "completionEndsFocus";

export type CompletionFocusOutcome =
  /** No session was running on the task. */
  | { ended: false; reason: "none" }
  /** Full-time task: the session keeps its whole length. */
  | { ended: false; reason: "full-time" }
  | {
      ended: true;
      sessionId: string;
      focusedMinutes: number;
      /** Minutes given back to the day; 0 when the clock was already out. */
      earlyMinutes: number;
    };

/**
 * A task was marked done. If a Focus session (running or paused) is on it, the
 * session ends as "completed early": minutes are booked to the task
 * (actualFocusedMinutes), the task's remaining block is released so the
 * scheduler can use the time, and every open client is told so the timer
 * disappears. Breaks are unaffected; a full-time task keeps its session (the
 * screens ask "N min left" instead).
 *
 * Every completion path (UI, API, MCP, connector) calls this, so they all end
 * the focus the same way. Never throws: the task is already saved.
 *
 * The caller re-runs the scheduler (the paths already do, or pass
 * `released` on to their own run): this only frees the blocks.
 */
export async function endFocusForCompletedTask(input: {
  userId: string;
  task: {
    id: string;
    title?: string | null;
    fullTime?: boolean | null;
    habitId?: string | null;
    isRecurring?: boolean | null;
    recurrenceMasterId?: string | null;
  };
}): Promise<CompletionFocusOutcome> {
  const { userId, task } = input;
  try {
    const session = await prisma.focusSession.findFirst({
      where: {
        userId,
        taskId: task.id,
        endedAt: null,
        phase: FocusSessionPhase.FOCUS,
      },
      orderBy: { startedAt: "desc" },
    });
    if (!session) return { ended: false, reason: "none" };
    if (effectiveFullTime(task)) return { ended: false, reason: "full-time" };

    // completed: true — the task is done, so this is not an abandoned session
    // and a strict mode's exit wait does not apply to it.
    const finalized = await finalizeSession({
      userId,
      sessionId: session.id,
      completed: true,
    });
    if (!finalized) return { ended: false, reason: "none" };

    const focused = finalized.elapsedMinutes;
    const early = earlyMinutes(session.plannedMinutes, focused);
    await releaseRemainingBlock(task.id);

    try {
      await publishRealtimeEvent(userId, "focus-ended", {
        sessionId: session.id,
        status: early > 0 ? "early" : "done",
        message: early > 0 ? earlyLine(early) : undefined,
      });
    } catch (error) {
      await logger.warn(
        "Could not publish the focus end for a completed task",
        {
          sessionId: session.id,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
    }
    return {
      ended: true,
      sessionId: session.id,
      focusedMinutes: focused,
      earlyMinutes: early,
    };
  } catch (error) {
    await logger.error(
      "Could not end the focus session of a completed task",
      {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return { ended: false, reason: "none" };
  }
}

/** Frees what is left of the task's plan: later blocks go, a running one stops now. */
async function releaseRemainingBlock(taskId: string) {
  const now = newDate();
  await prisma.scheduledBlock.deleteMany({
    where: { taskId, start: { gte: now } },
  });
  await prisma.scheduledBlock.updateMany({
    where: { taskId, start: { lt: now }, end: { gt: now } },
    data: { end: now },
  });
}
