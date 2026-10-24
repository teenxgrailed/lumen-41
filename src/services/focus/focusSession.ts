import { recomputeTaskActuals } from "@/services/time-tracking/timeEntries";
import {
  FocusSession,
  FocusSessionMode,
  FocusSessionPhase,
  FocusStrictnessMode,
  TimeEntrySource,
} from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { focusedMinutes, projectedEndsAt } from "@/lib/focus-timer";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { TaskStatus } from "@/types/task";

import { syncFocusEndJob } from "./focus-end-job";
import { recomputeFocusStats } from "./focusStats";
import {
  FocusTaskNotFoundError,
  type FocusTaskScope,
  scopedTaskId,
} from "./task-scope";

const LOG_SOURCE = "focusSession";
/** Only the strict modes (TIMEOUT, Pro) make ending early wait. */
const EXIT_DELAYS_SECONDS = [5, 10, 20] as const;

/**
 * How long an early end must wait after it is asked for. NORMAL never waits:
 * the person is allowed to stop their own session, at once. TIMEOUT keeps its
 * growing wait; DEEP_FOCUS is refused before this is asked.
 */
export function exitDelaySeconds(
  strictness: FocusStrictnessMode,
  attempt: number
): number {
  if (strictness === FocusStrictnessMode.NORMAL) return 0;
  const i = Math.max(0, Math.min(attempt, EXIT_DELAYS_SECONDS.length - 1));
  return EXIT_DELAYS_SECONDS[i];
}

export class FocusExitError extends Error {
  constructor(
    public readonly code:
      | "EXIT_DELAY_REQUIRED"
      | "EXIT_DELAY_ACTIVE"
      | "DEEP_FOCUS_LOCKED",
    public readonly retryAfter?: number
  ) {
    super(code);
    this.name = "FocusExitError";
  }
}

export class ActiveFocusSessionError extends Error {
  constructor() {
    super("ACTIVE_FOCUS_SESSION");
    this.name = "ActiveFocusSessionError";
  }
}

/**
 * The active session is the single FocusSession for a user with endedAt = null.
 * Server-side lifecycle: start -> (pause/resume)* -> stop. The client never
 * owns timing; it renders from these persisted fields via `@/lib/focus-timer`.
 */
export async function getActiveSession(
  userId: string
): Promise<FocusSession | null> {
  return prisma.focusSession.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
}

export async function startSession(input: {
  userId: string;
  taskId?: string | null;
  /** Required so no caller can bind a session to a task it never checked. */
  taskScope: FocusTaskScope;
  mode: FocusSessionMode;
  plannedMinutes?: number | null;
  source?: string;
  phase?: FocusSessionPhase;
  strictness?: FocusStrictnessMode;
  intention?: string | null;
}): Promise<FocusSession> {
  const existing = await getActiveSession(input.userId);
  if (existing) {
    throw new ActiveFocusSessionError();
  }

  let taskId: string | null = null;
  if (input.taskId) {
    taskId = await scopedTaskId(input.taskId, input.taskScope);
    if (!taskId) throw new FocusTaskNotFoundError();
  }

  const session = await prisma.focusSession.create({
    data: {
      userId: input.userId,
      taskId,
      mode: input.mode,
      plannedMinutes: input.plannedMinutes ?? null,
      elapsedMinutes: 0,
      startedAt: newDate(),
      source: input.source || "web",
      phase: input.phase ?? FocusSessionPhase.FOCUS,
      strictness: input.strictness ?? FocusStrictnessMode.NORMAL,
      intention: input.intention?.trim() || null,
    },
  });

  await syncFocusEndJob(session);
  logger.info(
    "Started focus session",
    { sessionId: session.id, mode: session.mode },
    LOG_SOURCE
  );
  return session;
}

export async function pauseSession(
  userId: string,
  sessionId: string
): Promise<FocusSession | null> {
  const session = await prisma.focusSession.findFirst({
    where: { id: sessionId, userId, endedAt: null },
  });
  if (!session || session.pausedAt) return session;

  // A pause has no end yet: the job goes until resume.
  const paused = await prisma.focusSession.update({
    where: { id: session.id },
    data: { pausedAt: newDate() },
  });
  await syncFocusEndJob(paused);
  return paused;
}

export async function resumeSession(
  userId: string,
  sessionId: string
): Promise<FocusSession | null> {
  const session = await prisma.focusSession.findFirst({
    where: { id: sessionId, userId, endedAt: null },
  });
  if (!session || !session.pausedAt) return session;

  const pausedSeconds = Math.max(
    0,
    Math.floor((newDate().getTime() - session.pausedAt.getTime()) / 1000)
  );

  const resumed = await prisma.focusSession.update({
    where: { id: session.id },
    data: {
      pausedAt: null,
      pausedTotalSeconds: session.pausedTotalSeconds + pausedSeconds,
    },
  });
  await syncFocusEndJob(resumed);
  return resumed;
}

export async function extendSession(
  userId: string,
  sessionId: string,
  minutes: number
) {
  const session = await prisma.focusSession.findFirst({
    where: { id: sessionId, userId, endedAt: null },
  });
  if (!session) return null;
  const extended = await prisma.focusSession.update({
    where: { id: session.id },
    data: {
      plannedMinutes: (session.plannedMinutes ?? 0) + Math.max(1, minutes),
    },
  });
  await syncFocusEndJob(extended);
  return extended;
}

export async function requestEarlyExit(userId: string, sessionId: string) {
  const session = await prisma.focusSession.findFirst({
    where: { id: sessionId, userId, endedAt: null },
  });
  if (!session) return null;
  if (session.strictness === FocusStrictnessMode.DEEP_FOCUS) {
    throw new FocusExitError("DEEP_FOCUS_LOCKED");
  }
  const attempt = Math.min(
    session.exitAttemptCount,
    EXIT_DELAYS_SECONDS.length - 1
  );
  const waitSeconds = exitDelaySeconds(session.strictness, attempt);
  const requestedAt = newDate();
  const updated = await prisma.focusSession.update({
    where: { id: session.id },
    data: {
      stopRequestedAt: requestedAt,
      exitAttemptCount: { increment: 1 },
    },
  });
  return {
    session: updated,
    waitSeconds,
    readyAt: new Date(requestedAt.getTime() + waitSeconds * 1000),
  };
}

/**
 * Finalize (stop) a session: write endedAt, the focused minutes, and the
 * completed/abandoned outcome. On a completed, task-bound session we also log a
 * TimeEntry, roll the task's actual minutes, and bump `actualFocusedMinutes`.
 * Optionally marks the bound task done.
 */
export async function finalizeSession(input: {
  userId: string;
  sessionId: string;
  completed: boolean;
  markTaskDone?: boolean;
  /**
   * The tasks this caller may change. The session always ends; its task is
   * only written to (time entry, focused minutes, done) when it is found
   * inside this scope, so a caller that cannot edit it, or that works in
   * another workspace, leaves it alone.
   */
  taskScope: FocusTaskScope;
}): Promise<FocusSession | null> {
  const session = await prisma.focusSession.findFirst({
    where: { id: input.sessionId, userId: input.userId, endedAt: null },
  });
  if (!session) return null;

  if (!input.completed) {
    if (session.strictness === FocusStrictnessMode.DEEP_FOCUS) {
      throw new FocusExitError("DEEP_FOCUS_LOCKED");
    }
    // NORMAL ends at once. A strict mode (TIMEOUT) asks first and waits.
    if (session.strictness !== FocusStrictnessMode.NORMAL) {
      if (!session.stopRequestedAt) {
        throw new FocusExitError("EXIT_DELAY_REQUIRED");
      }
      const delaySeconds = exitDelaySeconds(
        session.strictness,
        session.exitAttemptCount - 1
      );
      const remaining = Math.ceil(
        (session.stopRequestedAt.getTime() +
          delaySeconds * 1000 -
          newDate().getTime()) /
          1000
      );
      if (remaining > 0) {
        throw new FocusExitError("EXIT_DELAY_ACTIVE", remaining);
      }
    }
  }

  let endedAt = newDate();
  // A clock that ran out ends at its planned end, not whenever someone found it
  // (a tab reopened hours later must not book hours of focus).
  if (input.completed && session.plannedMinutes != null && !session.pausedAt) {
    const dueAt = newDate(
      session.startedAt.getTime() +
        (session.plannedMinutes * 60 + session.pausedTotalSeconds) * 1000
    );
    if (dueAt.getTime() < endedAt.getTime()) endedAt = dueAt;
  }
  // Fold any in-progress pause into the total so focused minutes are accurate.
  const pausedTotalSeconds = session.pausedAt
    ? session.pausedTotalSeconds +
      Math.max(
        0,
        Math.floor((endedAt.getTime() - session.pausedAt.getTime()) / 1000)
      )
    : session.pausedTotalSeconds;

  const minutes = focusedMinutes(
    {
      startedAt: session.startedAt,
      plannedMinutes: session.plannedMinutes,
      pausedTotalSeconds,
      pausedAt: null,
    },
    endedAt
  );

  const finalized = await prisma.focusSession.update({
    where: { id: session.id },
    data: {
      endedAt,
      pausedAt: null,
      pausedTotalSeconds,
      elapsedMinutes: minutes,
      completed: input.completed,
      abandoned: !input.completed,
    },
  });

  await syncFocusEndJob(finalized);

  // Only a task found inside the caller's scope is written to; `taskId` below
  // is the id that lookup returned.
  const taskId = session.taskId
    ? await scopedTaskId(session.taskId, input.taskScope)
    : null;
  if (session.taskId && !taskId) {
    logger.warn(
      "Focus session task is outside the caller's scope; left untouched",
      { sessionId: session.id, taskId: session.taskId },
      LOG_SOURCE
    );
  }

  // Time spent counts whether the clock ran out or the person stopped early.
  if (taskId && session.phase === FocusSessionPhase.FOCUS && minutes > 0) {
    await prisma.timeEntry.create({
      data: {
        taskId,
        userId: input.userId,
        startedAt: session.startedAt,
        endedAt,
        source: TimeEntrySource.focus,
      },
    });
    await prisma.task.update({
      where: { id: taskId },
      data: { actualFocusedMinutes: { increment: minutes } },
    });
    await recomputeTaskActuals(taskId);
  }

  if (taskId && input.markTaskDone) {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.COMPLETED, completedAt: endedAt },
    });
  }

  await recomputeFocusStats(input.userId);

  logger.info(
    "Finalized focus session",
    { sessionId: session.id, completed: input.completed, minutes },
    LOG_SOURCE
  );
  return finalized;
}

/**
 * Lightweight active-session snapshot.
 *
 * GET /api/focus/active returns this shape ({ active, taskId, endsAt }). A
 * future Chrome extension will poll that endpoint to enforce website/app
 * blocking while a focus session is running, so keep the shape stable and
 * cheap. `endsAt` is null for a free/flow session (no fixed end) or when no
 * session is active.
 */
export function activeSummary(session: FocusSession | null): {
  active: boolean;
  taskId: string | null;
  endsAt: string | null;
} {
  if (!session) return { active: false, taskId: null, endsAt: null };
  const endsAt = projectedEndsAt(
    {
      startedAt: session.startedAt,
      plannedMinutes: session.plannedMinutes,
      pausedTotalSeconds: session.pausedTotalSeconds,
      pausedAt: session.pausedAt,
    },
    newDate()
  );
  return {
    active: true,
    taskId: session.taskId,
    endsAt: endsAt ? endsAt.toISOString() : null,
  };
}
