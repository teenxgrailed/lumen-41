import {
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import {
  endOfDay,
  formatInTimeZone,
  newDate,
  startOfDay,
} from "@/lib/date-utils";
import { normalizeUserTimeZone } from "@/lib/habit-completion-date";
import { prisma } from "@/lib/prisma";

import { listAgentMemories, touchMemories } from "./memory";
import { assembleAgentSystemPrompt } from "./system-prompt";

export async function getTodayScheduleSummary(
  userId: string,
  workspace: WorkspaceAccess
) {
  const now = newDate();
  const [tasks, preferences] = await Promise.all([
    prisma.task.findMany({
      where: {
        ...workspaceDataScopeWhere(workspace, userId),
        isArchived: false,
        status: { not: "completed" },
        OR: [
          {
            scheduledStart: {
              gte: startOfDay(now),
              lte: endOfDay(now),
            },
          },
          { deadline: { gte: startOfDay(now), lte: endOfDay(now) } },
        ],
      },
      orderBy: [{ scheduledStart: "asc" }, { priorityLevel: "desc" }],
      take: 24,
      select: {
        title: true,
        estimatedMinutes: true,
        duration: true,
        scheduledStart: true,
        scheduledEnd: true,
        deadline: true,
      },
    }),
    prisma.schedulingPreferences.findUnique({ where: { userId } }),
  ]);

  const scheduledMinutes = tasks.reduce((total, task) => {
    if (task.scheduledStart && task.scheduledEnd) {
      return (
        total +
        Math.max(
          0,
          Math.round(
            (task.scheduledEnd.getTime() - task.scheduledStart.getTime()) /
              60_000
          )
        )
      );
    }
    return total + (task.estimatedMinutes ?? task.duration ?? 0);
  }, 0);
  const workHours =
    preferences?.workHours &&
    typeof preferences.workHours === "object" &&
    !Array.isArray(preferences.workHours)
      ? (preferences.workHours as Record<
          string,
          { start?: string; end?: string }
        >)
      : {};
  const todayHours = workHours[String(now.getDay())];
  const workMinutes =
    todayHours?.start && todayHours.end
      ? Math.max(
          0,
          Number(todayHours.end.slice(0, 2)) * 60 +
            Number(todayHours.end.slice(3, 5)) -
            Number(todayHours.start.slice(0, 2)) * 60 -
            Number(todayHours.start.slice(3, 5))
        )
      : 8 * 60;

  const summary = tasks.length
    ? tasks
        .map((task) => {
          const time = task.scheduledStart
            ? task.scheduledStart.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "unscheduled";
          return `${time} ${task.title}`;
        })
        .join("; ")
    : "No scheduled tasks today.";

  return {
    summary,
    taskCount: tasks.length,
    scheduledMinutes,
    workMinutes,
    overloaded: scheduledMinutes > workMinutes,
  };
}

export async function buildAgentPromptForUser(
  userId: string,
  soulPreset: string,
  workspace: WorkspaceAccess
) {
  const [memories, schedule] = await Promise.all([
    listAgentMemories(userId, workspace.workspaceId),
    getTodayScheduleSummary(userId, workspace),
  ]);
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { timeZone: true },
  });
  const timeZone = normalizeUserTimeZone(settings?.timeZone);
  const now = newDate();
  const result = assembleAgentSystemPrompt({
    soulPreset,
    memories,
    scheduleSummary: schedule.summary,
    agent: {
      now: `${formatInTimeZone(now, timeZone, "EEEE yyyy-MM-dd HH:mm")}`,
      timeZone,
    },
  });
  await touchMemories(userId, workspace.workspaceId, result.usedMemoryIds);
  return result.prompt;
}
