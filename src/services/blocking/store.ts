import { SubscriptionPlan } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { getPlan } from "@/lib/entitlements";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { FOCUS_BLOCKING } from "@/lib/feature-flags-keys";
import { prisma } from "@/lib/prisma";

import { TaskStatus } from "@/types/task";

import { type ActiveBlocking, resolveActiveBlocking } from "./active";
import {
  BLOCKING_PROFILES_MAX,
  type BlockingProfileCreate,
  type BlockingProfileUpdate,
  blockingProfileSelect,
} from "./profile";

/** Why a person cannot use blocking: the flag is off, or the plan is Free. */
export type BlockingAccess =
  | { allowed: true }
  | { allowed: false; reason: "disabled" | "upgrade_required" };

export async function blockingAccess(userId: string): Promise<BlockingAccess> {
  if (!(await isFeatureEnabled(FOCUS_BLOCKING, userId))) {
    return { allowed: false, reason: "disabled" };
  }
  const plan = await getPlan(userId);
  return plan === SubscriptionPlan.FREE
    ? { allowed: false, reason: "upgrade_required" }
    : { allowed: true };
}

export class BlockingLimitError extends Error {
  constructor() {
    super(`At most ${BLOCKING_PROFILES_MAX} blocking profiles`);
  }
}

export function listBlockingProfiles(userId: string) {
  return prisma.blockingProfile.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: blockingProfileSelect,
  });
}

export function getBlockingProfile(userId: string, id: string) {
  return prisma.blockingProfile.findFirst({
    where: { id, userId },
    select: blockingProfileSelect,
  });
}

export async function createBlockingProfile(
  userId: string,
  data: BlockingProfileCreate
) {
  const count = await prisma.blockingProfile.count({ where: { userId } });
  if (count >= BLOCKING_PROFILES_MAX) throw new BlockingLimitError();
  return prisma.blockingProfile.create({
    data: { ...data, userId },
    select: blockingProfileSelect,
  });
}

/** Null when the profile is not this person's. */
export async function updateBlockingProfile(
  userId: string,
  id: string,
  data: BlockingProfileUpdate
) {
  const { count } = await prisma.blockingProfile.updateMany({
    where: { id, userId },
    data,
  });
  return count === 0 ? null : getBlockingProfile(userId, id);
}

export async function deleteBlockingProfile(userId: string, id: string) {
  const { count } = await prisma.blockingProfile.deleteMany({
    where: { id, userId },
  });
  return count > 0;
}

/** How many calendar events and task blocks are read for one check. */
const NOW_ROWS_MAX = 50;

/** Loads what is under way for this person and resolves their profiles. */
export async function loadActiveBlocking(
  userId: string,
  now: Date = newDate()
): Promise<ActiveBlocking> {
  const [profiles, session, events, blocks] = await Promise.all([
    prisma.blockingProfile.findMany({ where: { userId, enabled: true } }),
    prisma.focusSession.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        startedAt: true,
        plannedMinutes: true,
        pausedAt: true,
        pausedTotalSeconds: true,
        task: { select: { title: true } },
      },
    }),
    prisma.calendarEvent.findMany({
      where: {
        feed: { userId, enabled: true },
        start: { lte: now },
        end: { gt: now },
        archivedAt: null,
        isMaster: false,
        allDay: false,
        selfDeclined: false,
      },
      orderBy: { start: "asc" },
      take: NOW_ROWS_MAX,
      select: { id: true, title: true, feedId: true, end: true },
    }),
    prisma.scheduledBlock.findMany({
      where: {
        userId,
        start: { lte: now },
        end: { gt: now },
        task: { status: { not: TaskStatus.COMPLETED }, isArchived: false },
      },
      orderBy: { start: "asc" },
      take: NOW_ROWS_MAX,
      select: {
        end: true,
        task: { select: { id: true, title: true, projectId: true } },
      },
    }),
  ]);

  const endsAt =
    session && session.plannedMinutes && !session.pausedAt
      ? new Date(
          session.startedAt.getTime() +
            session.plannedMinutes * 60_000 +
            session.pausedTotalSeconds * 1000
        )
      : null;

  return resolveActiveBlocking({
    profiles,
    session: session
      ? {
          id: session.id,
          startedAt: session.startedAt,
          endsAt,
          taskTitle: session.task?.title ?? null,
        }
      : null,
    events,
    blocks: blocks.map((b) => ({
      taskId: b.task.id,
      taskTitle: b.task.title,
      projectId: b.task.projectId,
      end: b.end,
    })),
  });
}
