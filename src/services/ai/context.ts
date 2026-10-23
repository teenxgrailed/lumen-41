import {
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import {
  addCalendarDays,
  formatInTimeZone,
  newDate,
  startOfDayInTimeZone,
} from "@/lib/date-utils";
import { normalizeUserTimeZone } from "@/lib/habit-completion-date";
import { prisma } from "@/lib/prisma";

import { isLearningEnabled, listMemoriesForUse, touchMemories } from "./memory";
import { runLearning } from "./memory-learning";
import { assembleAgentSystemPrompt } from "./system-prompt";
import { oneLine } from "./untrusted";

const TITLE_MAX = 120;

export async function getTodayScheduleSummary(
  userId: string,
  workspace: WorkspaceAccess
) {
  const now = newDate();
  // "Today" is the person's day; the server clock is UTC.
  const userSettings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { timeZone: true },
  });
  const zone = normalizeUserTimeZone(userSettings?.timeZone);
  const dayStart = startOfDayInTimeZone(now, zone);
  const dayEnd = new Date(addCalendarDays(dayStart, 1, zone).getTime() - 1);
  const [tasks, preferences] = await Promise.all([
    prisma.task.findMany({
      where: {
        ...workspaceDataScopeWhere(workspace, userId),
        isArchived: false,
        status: { not: "completed" },
        // The person's own day: what is assigned to them, and what they
        // created and left unassigned. A shared workspace also holds the
        // other members' tasks, and their titles are not this person's day.
        AND: [
          { OR: [{ assigneeId: userId }, { assigneeId: null, userId }] },
          {
            OR: [
              {
                scheduledStart: { gte: dayStart, lte: dayEnd },
              },
              { deadline: { gte: dayStart, lte: dayEnd } },
            ],
          },
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
  const todayHours =
    workHours[String(Number(formatInTimeZone(now, zone, "i")) % 7)];
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
            ? formatInTimeZone(task.scheduledStart, zone, "HH:mm")
            : "unscheduled";
          // A title is text someone typed or a sync brought in: keep it to
          // one short line so it cannot break the schedule apart.
          return `${time} ${oneLine(task.title, TITLE_MAX)}`;
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
  // Switch off: no pass runs and no memory is read. Documents and mail are
  // learned in the background so Ask never waits on them.
  await runLearning(userId, workspace, { background: true });
  const learning = await isLearningEnabled(userId);
  const [memories, schedule] = await Promise.all([
    listMemoriesForUse(userId, workspace.workspaceId),
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
    learning,
    memories,
    scheduleSummary: schedule.summary,
    agent: {
      now: `${formatInTimeZone(now, timeZone, "EEEE yyyy-MM-dd HH:mm")}`,
      timeZone,
    },
  });
  await touchMemories(userId, workspace.workspaceId, result.usedMemoryIds);
  // `systemPrompt` holds instructions only. `contextBlock` (today's schedule
  // and memories, quoted as data) is sent as the first user message.
  return { systemPrompt: result.prompt, contextBlock: result.contextBlock };
}
