import { newDate } from "@/lib/date-utils";
import {
  habitDayKey,
  normalizeUserTimeZone,
} from "@/lib/habit-completion-date";
import { prisma } from "@/lib/prisma";

import {
  DAY_PLAN_LIMITS,
  DayPlanError,
  type EffectiveSettings,
  type PlanSettingsPatch,
  dateFromKey,
  defaultFocusMinutes,
  mainLimitFor,
  planSettingsPatchSchema,
  suggestedLimitFrom,
} from "./rules";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function userTimeZone(userId: string): Promise<string> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { timeZone: true },
  });
  return normalizeUserTimeZone(settings?.timeZone);
}

/** The person's settings, or the defaults when they never changed any. */
export async function getPlanSettings(
  userId: string
): Promise<EffectiveSettings> {
  const row = await prisma.planSettings.findUnique({ where: { userId } });
  if (row) {
    return {
      taskLimit: row.taskLimit,
      mainLimit: mainLimitFor(row.taskLimit),
      focusMinutes: row.focusMinutes,
      morningTime: row.morningTime,
      eveningTime: row.eveningTime,
      morningOn: row.morningOn,
      eveningOn: row.eveningOn,
    };
  }
  const prefs = await prisma.schedulingPreferences.findUnique({
    where: { userId },
    select: { maxDeepWorkPerDay: true },
  });
  return {
    taskLimit: DAY_PLAN_LIMITS.taskDefault,
    mainLimit: mainLimitFor(DAY_PLAN_LIMITS.taskDefault),
    focusMinutes: defaultFocusMinutes(prefs?.maxDeepWorkPerDay ?? null),
    morningTime: "08:00",
    eveningTime: "21:00",
    morningOn: true,
    eveningOn: true,
  };
}

/**
 * The limit the person's history points to, or null: fewer than 14 plan days,
 * the same as the current limit, or dismissed in the last 14 days. It is
 * computed from the stored plans, so recomputing gives the value shown (D2).
 * It never changes the setting by itself.
 */
export async function suggestLimit(
  userId: string,
  now: Date = newDate()
): Promise<number | null> {
  const [timeZone, settings, stored] = await Promise.all([
    userTimeZone(userId),
    getPlanSettings(userId),
    prisma.planSettings.findUnique({
      where: { userId },
      select: { limitSuggestionDismissedAt: true },
    }),
  ]);
  const dismissedAt = stored?.limitSuggestionDismissedAt;
  if (
    dismissedAt &&
    now.getTime() - dismissedAt.getTime() <
      DAY_PLAN_LIMITS.suggestionQuietDays * DAY_MS
  ) {
    return null;
  }
  const today = dateFromKey(habitDayKey(now, timeZone));
  const plans = await prisma.dayPlan.findMany({
    where: {
      userId,
      OR: [{ status: "closed" }, ...(today ? [{ date: { lt: today } }] : [])],
    },
    orderBy: { date: "desc" },
    take: DAY_PLAN_LIMITS.suggestionMinDays,
    select: {
      items: {
        select: { resolution: true, task: { select: { status: true } } },
      },
    },
  });
  const days = plans.filter((plan) => plan.items.length > 0);
  const done = days.map(
    (plan) =>
      plan.items.filter(
        (item) =>
          item.resolution === "done" || item.task?.status === "completed"
      ).length
  );
  const value = suggestedLimitFrom(done);
  return value === null || value === settings.taskLimit ? null : value;
}

/**
 * Changes plan settings. Anything outside the allowed ranges is rejected with
 * a message naming the range, and the stored setting stays as it was.
 */
export async function updatePlanSettings(
  userId: string,
  input: unknown,
  now: Date = newDate()
): Promise<EffectiveSettings> {
  const parsed = planSettingsPatchSchema.safeParse(input);
  if (!parsed.success) {
    throw new DayPlanError(
      "invalid_input",
      400,
      parsed.error.issues.map((issue) => issue.message).join("; "),
      { issues: parsed.error.issues.map((issue) => issue.path.join(".")) }
    );
  }
  const { acceptSuggestion, dismissSuggestion, ...patch } = parsed.data;
  const data: Omit<
    PlanSettingsPatch,
    "acceptSuggestion" | "dismissSuggestion"
  > & {
    mainLimit?: number;
    limitSuggestionDismissedAt?: Date;
    limitSuggestion?: null;
  } = { ...patch };

  if (acceptSuggestion) {
    const suggestion = await suggestLimit(userId, now);
    if (suggestion === null) {
      throw new DayPlanError("invalid_input", 409, "There is no suggestion");
    }
    data.taskLimit = suggestion;
    data.limitSuggestion = null;
  }
  if (dismissSuggestion) {
    data.limitSuggestionDismissedAt = now;
    data.limitSuggestion = null;
  }
  if (data.taskLimit !== undefined)
    data.mainLimit = mainLimitFor(data.taskLimit);

  const current = await getPlanSettings(userId);
  await prisma.planSettings.upsert({
    where: { userId },
    create: {
      userId,
      taskLimit: current.taskLimit,
      mainLimit: current.mainLimit,
      focusMinutes: current.focusMinutes,
      morningTime: current.morningTime,
      eveningTime: current.eveningTime,
      morningOn: current.morningOn,
      eveningOn: current.eveningOn,
      ...data,
    },
    update: data,
  });
  return getPlanSettings(userId);
}
