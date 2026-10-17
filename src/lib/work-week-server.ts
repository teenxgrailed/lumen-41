import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ensureDefaultWorkSchedule } from "@/lib/work-schedules";
import {
  type WeekHours,
  latestEnd,
  legacyFromWeek,
  weekFromLegacy,
  weekToWindows,
  windowsToWeek,
} from "@/lib/work-week";

/** Hours of the user's default schedule, one entry per weekday. */
export async function loadWeekHours(userId: string): Promise<WeekHours> {
  const schedule = await ensureDefaultWorkSchedule(prisma, userId);
  return windowsToWeek(schedule.windows);
}

/**
 * Keep the single-range columns in step with the week: capacity, nudges and
 * the older settings store still read them. The scheduler's hard stop is
 * raised to the week's latest end, otherwise it would cut a longer day short.
 */
export async function mirrorLegacyColumns(
  tx: Prisma.TransactionClient,
  userId: string,
  week: WeekHours
) {
  const legacy = legacyFromWeek(week);
  const data = {
    workDays: JSON.stringify(legacy.workDays),
    workHourStart: legacy.workHourStart,
    workHourEnd: legacy.workHourEnd,
  };
  await tx.autoScheduleSettings.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
  const end = latestEnd(week);
  if (end) {
    const prefs = await tx.schedulingPreferences.findUnique({
      where: { userId },
      select: { hardStopTime: true },
    });
    if (prefs && prefs.hardStopTime < end) {
      await tx.schedulingPreferences.update({
        where: { userId },
        data: { hardStopTime: end },
      });
    }
  }
}

/** Replace the default schedule's windows with the week and mirror the columns. */
export async function saveWeekHours(userId: string, week: WeekHours) {
  const schedule = await ensureDefaultWorkSchedule(prisma, userId);
  await prisma.$transaction(async (tx) => {
    await tx.workScheduleWindow.deleteMany({
      where: { scheduleId: schedule.id },
    });
    const windows = weekToWindows(week);
    if (windows.length > 0) {
      await tx.workScheduleWindow.createMany({
        data: windows.map((window) => ({
          scheduleId: schedule.id,
          dayOfWeek: window.dayOfWeek,
          startTime: window.startTime,
          endTime: window.endTime,
          sortOrder: window.sortOrder ?? 0,
        })),
      });
    }
    await mirrorLegacyColumns(tx, userId, week);
  });
  return week;
}

interface LegacyShape {
  workDays: string;
  workHourStart: number;
  workHourEnd: number;
}

/**
 * Someone wrote the single range (onboarding, the phone page, an API client).
 * Apply it to the week: when the hours changed every enabled day takes the new
 * range; when only the day list changed, days that stay on keep their own
 * hours and new days get the range. Returns null when nothing relevant moved.
 */
export function weekAfterLegacyWrite(
  current: WeekHours,
  before: LegacyShape | null,
  after: LegacyShape
): WeekHours | null {
  const parse = (raw: string) => {
    try {
      const value = JSON.parse(raw) as unknown;
      return Array.isArray(value)
        ? value.filter(
            (n): n is number => Number.isInteger(n) && n >= 0 && n <= 6
          )
        : [];
    } catch {
      return [];
    }
  };
  const days = parse(after.workDays);
  const hoursChanged =
    !before ||
    before.workHourStart !== after.workHourStart ||
    before.workHourEnd !== after.workHourEnd;
  const daysChanged =
    !before || JSON.stringify(parse(before.workDays)) !== JSON.stringify(days);
  if (!hoursChanged && !daysChanged) return null;
  if (after.workHourStart >= after.workHourEnd) return null;

  const uniform = weekFromLegacy(days, after.workHourStart, after.workHourEnd);
  if (hoursChanged) return uniform;
  return uniform.map((entry) => {
    const existing = current.find((day) => day.day === entry.day);
    return entry.on && existing?.on ? existing : entry;
  });
}
