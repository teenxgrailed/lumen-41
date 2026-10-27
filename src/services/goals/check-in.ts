import { ProactiveNudgeType } from "@prisma/client";

import { formatInTimeZone, fromZonedTime, newDate } from "@/lib/date-utils";
import { canUseGoals } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

/**
 * The latest weekly check-in slot at or before `now`: the given weekday
 * (0 = Sunday) and hour in `timeZone`. `dayKey` is that slot's local day, so
 * one week has one key.
 */
export function lastCheckInSlot(
  now: Date,
  timeZone: string,
  weekday: number,
  hour: number
): { dayKey: string; at: Date } {
  const localWeekday = Number(formatInTimeZone(now, timeZone, "i")) % 7;
  const localHour = Number(formatInTimeZone(now, timeZone, "H"));
  let back = (localWeekday - weekday + 7) % 7;
  if (back === 0 && localHour < hour) back = 7;
  const [year, month, day] = formatInTimeZone(now, timeZone, "yyyy-MM-dd")
    .split("-")
    .map(Number);
  const dayKey = newDate(Date.UTC(year, month - 1, day - back))
    .toISOString()
    .slice(0, 10);
  const at = fromZonedTime(
    `${dayKey}T${String(hour).padStart(2, "0")}:00:00`,
    timeZone
  );
  return { dayKey, at };
}

export interface GoalCheckInDraft {
  subject: string;
  type: ProactiveNudgeType;
  timeWindow: string;
  title: string;
  body: string;
  deepLink: string;
}

/**
 * "How's <goal>?" once a week per goal (Pro), from the weekly slot on: an
 * active goal with the check-in on, not answered since that slot and made
 * before it. The nudge's dedupe key carries the week, so it is asked once.
 */
export async function goalCheckInDrafts(
  userId: string,
  timeZone: string,
  now: Date = newDate()
): Promise<GoalCheckInDraft[]> {
  const entitlement = await canUseGoals(userId);
  if (!entitlement.allowed) return [];
  const goals = await prisma.goal.findMany({
    where: {
      userId,
      status: "active",
      archivedAt: null,
      checkInEnabled: true,
    },
    select: {
      id: true,
      title: true,
      checkInWeekday: true,
      checkInHour: true,
      lastCheckInAt: true,
      createdAt: true,
    },
    take: 100,
  });
  const drafts: GoalCheckInDraft[] = [];
  for (const goal of goals) {
    const slot = lastCheckInSlot(
      now,
      timeZone,
      goal.checkInWeekday,
      goal.checkInHour
    );
    if (goal.createdAt > slot.at) continue;
    if (goal.lastCheckInAt && goal.lastCheckInAt >= slot.at) continue;
    drafts.push({
      subject: `goal:${goal.id}`,
      type: ProactiveNudgeType.GOAL_CHECKIN,
      timeWindow: slot.dayKey,
      title: `How's ${goal.title}?`,
      body: "Update where it stands, or add a note.",
      deepLink: `/goals?goal=${encodeURIComponent(goal.id)}&checkin=1`,
    });
  }
  return drafts;
}
