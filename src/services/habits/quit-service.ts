import { NextResponse } from "next/server";

import {
  HabitEventType,
  HabitKind,
  type Prisma,
  type SubscriptionPlan,
} from "@prisma/client";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";
import { quitHabitsEnabled } from "@/lib/feature-flags";
import { normalizeUserTimeZone } from "@/lib/habit-completion-date";
import { summarizeQuit } from "@/lib/habits-quit";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "HabitQuitService";

/** An event may be at most this far ahead of the server clock (clock skew). */
const EVENT_FUTURE_SLACK_MS = 5 * 60 * 1000;

/**
 * Why a QUIT-habit call was refused, as an HTTP-shaped result both the REST
 * routes and the MCP tools turn into their own error: the flag is off (404,
 * the feature does not exist for this account) or the plan lacks it (403).
 */
export type QuitGateRefusal =
  | { status: 404; error: "NOT_AVAILABLE" }
  | { status: 403; error: "UPGRADE_REQUIRED"; plan: SubscriptionPlan };

/** null when QUIT habits are available to this account. */
export async function quitGate(
  userId: string
): Promise<QuitGateRefusal | null> {
  const gate = await quitHabitsEnabled(userId);
  if (gate.allowed) return null;
  return gate.reason === "flag_off"
    ? { status: 404, error: "NOT_AVAILABLE" }
    : { status: 403, error: "UPGRADE_REQUIRED", plan: gate.plan };
}

/** The refusal as a REST answer: 404 when the flag is off, 403 for Free. */
export function quitGateResponse(refusal: QuitGateRefusal) {
  return refusal.status === 404
    ? NextResponse.json({ error: "Not found" }, { status: 404 })
    : NextResponse.json(
        {
          error: "UPGRADE_REQUIRED",
          entitlement: {
            feature: "quitHabits",
            allowed: false,
            upgradeRequired: true,
            plan: refusal.plan,
          },
        },
        { status: 403 }
      );
}

export class QuitHabitEventError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404
  ) {
    super(message);
  }
}

async function userTimeZone(userId: string): Promise<string> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { timeZone: true },
  });
  return normalizeUserTimeZone(settings?.timeZone);
}

/** The person's own active-or-not QUIT habit in this workspace, or null. */
async function findQuitHabit(
  userId: string,
  workspace: WorkspaceAccess,
  habitId: string
) {
  return prisma.habit.findFirst({
    where: {
      id: habitId,
      ...workspaceDataScopeWhere(workspace, userId),
      userId,
      archivedAt: null,
      kind: HabitKind.QUIT,
    },
    select: { id: true, quitStartedAt: true, title: true },
  });
}

export interface HabitEventInput {
  type: HabitEventType;
  at?: Date;
  tag?: string | null;
  intensity?: number | null;
  note?: string | null;
}

/**
 * Logs one event on a QUIT habit. A RELAPSE needs nothing else: the streak is
 * derived from the log (src/lib/habits-quit.ts), so the same row restarts it
 * everywhere. Throws `QuitHabitEventError` for a habit that is not the
 * caller's QUIT habit (404) or an event dated in the future (400).
 */
export async function recordHabitEvent(input: {
  userId: string;
  workspace: WorkspaceAccess;
  habitId: string;
  event: HabitEventInput;
  now?: Date;
}) {
  const now = input.now ?? newDate();
  const habit = await findQuitHabit(
    input.userId,
    input.workspace,
    input.habitId
  );
  if (!habit) throw new QuitHabitEventError("Quit habit not found", 404);
  const at = input.event.at ?? now;
  if (at.getTime() > now.getTime() + EVENT_FUTURE_SLACK_MS) {
    throw new QuitHabitEventError("An event cannot be in the future", 400);
  }
  const event = await prisma.habitEvent.create({
    data: {
      habitId: habit.id,
      userId: input.userId,
      type: input.event.type,
      at,
      tag: input.event.tag ?? null,
      intensity: input.event.intensity ?? null,
      note: input.event.note ?? null,
    },
  });
  logger.info(
    "Habit event logged",
    { habitId: habit.id, type: event.type },
    LOG_SOURCE
  );
  return event;
}

/**
 * Writes tag, intensity and note onto an existing event of the caller's own
 * QUIT habit. The type and time are not editable. null when the event is not
 * the caller's.
 */
export async function updateHabitEvent(input: {
  userId: string;
  workspace: WorkspaceAccess;
  habitId: string;
  eventId: string;
  patch: {
    tag?: string | null;
    intensity?: number | null;
    note?: string | null;
  };
}) {
  const habit = await findQuitHabit(
    input.userId,
    input.workspace,
    input.habitId
  );
  if (!habit) return null;
  const existing = await prisma.habitEvent.findFirst({
    where: { id: input.eventId, habitId: habit.id, userId: input.userId },
    select: { id: true },
  });
  if (!existing) return null;
  const { tag, intensity, note } = input.patch;
  return prisma.habitEvent.update({
    where: { id: existing.id },
    data: {
      ...(tag !== undefined ? { tag } : {}),
      ...(intensity !== undefined ? { intensity } : {}),
      ...(note !== undefined ? { note } : {}),
    },
  });
}

export const EVENTS_DEFAULT_LIMIT = 50;
export const EVENTS_MAX_LIMIT = 200;

/** Newest first; `before` pages backwards by `at`. null when not a QUIT habit. */
export async function listHabitEvents(input: {
  userId: string;
  workspace: WorkspaceAccess;
  habitId: string;
  type?: HabitEventType;
  before?: Date;
  limit?: number;
}) {
  const habit = await findQuitHabit(
    input.userId,
    input.workspace,
    input.habitId
  );
  if (!habit) return null;
  const limit = Math.min(
    Math.max(1, input.limit ?? EVENTS_DEFAULT_LIMIT),
    EVENTS_MAX_LIMIT
  );
  const where: Prisma.HabitEventWhereInput = {
    habitId: habit.id,
    userId: input.userId,
    ...(input.type ? { type: input.type } : {}),
    ...(input.before ? { at: { lt: input.before } } : {}),
  };
  const rows = await prisma.habitEvent.findMany({
    where,
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const events = rows.slice(0, limit);
  return {
    events,
    nextBefore: rows.length > limit ? events[events.length - 1].at : null,
  };
}

/** Streaks, milestones and the urge pattern. null when not a QUIT habit. */
export async function getQuitSummary(input: {
  userId: string;
  workspace: WorkspaceAccess;
  habitId: string;
  now?: Date;
}) {
  const habit = await findQuitHabit(
    input.userId,
    input.workspace,
    input.habitId
  );
  if (!habit) return null;
  const [timeZone, events] = await Promise.all([
    userTimeZone(input.userId),
    prisma.habitEvent.findMany({
      where: { habitId: habit.id, userId: input.userId },
      select: { type: true, at: true, tag: true },
      orderBy: { at: "asc" },
    }),
  ]);
  return {
    habitId: habit.id,
    quitStartedAt: habit.quitStartedAt,
    ...summarizeQuit({
      quitStartedAt: habit.quitStartedAt,
      events,
      now: input.now ?? newDate(),
      timeZone,
    }),
  };
}
