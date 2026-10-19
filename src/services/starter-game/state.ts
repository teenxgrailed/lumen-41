import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { addCalendarDays, newDate } from "@/lib/date-utils";
import { getPlan } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import {
  STARTER_HIDE_DAYS,
  STARTER_OPEN_TASK_LIMIT,
  type StarterGameStatus,
  type StarterHide,
} from "@/lib/starter-game";

/**
 * The Starter game's entry card: whether it may show, and what "Not now" and
 * "Don't show again" remember. One small row per person; it is read here and
 * written only by `hideStarterGame`.
 */

/** Open tasks as the screens count them: not done, not archived. */
export function openTaskWhere(
  workspace: WorkspaceAccess | undefined,
  userId: string
) {
  return {
    ...workspaceDataScopeWhere(workspace, userId),
    isArchived: false,
    status: { in: ["todo", "in_progress"] },
  };
}

export async function readStarterStatus(input: {
  userId: string;
  workspace: WorkspaceAccess | undefined;
  now?: Date;
}): Promise<StarterGameStatus> {
  const now = input.now ?? newDate();
  const [row, openTasks, plan] = await Promise.all([
    prisma.starterGameState.findUnique({ where: { userId: input.userId } }),
    prisma.task.count({ where: openTaskWhere(input.workspace, input.userId) }),
    getPlan(input.userId),
  ]);
  const neverShow = row?.neverShow ?? false;
  const hiddenUntil = row?.hiddenUntil ?? null;
  const hidden = neverShow || (hiddenUntil !== null && hiddenUntil > now);
  return {
    hiddenUntil: hiddenUntil ? hiddenUntil.toISOString() : null,
    neverShow,
    hidden,
    openTasks,
    eligible: !hidden && openTasks < STARTER_OPEN_TASK_LIMIT,
    canPlay: plan !== "FREE",
  };
}

/** "7d" hides for a week, "never" for good, "show" brings the card back. */
export async function hideStarterGame(
  userId: string,
  mode: StarterHide,
  now: Date = newDate()
) {
  const data =
    mode === "never"
      ? { neverShow: true, hiddenUntil: null }
      : mode === "7d"
        ? {
            neverShow: false,
            hiddenUntil: addCalendarDays(now, STARTER_HIDE_DAYS),
          }
        : { neverShow: false, hiddenUntil: null };
  await prisma.starterGameState.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}
