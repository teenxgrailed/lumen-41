import {
  type NotificationPrefs,
  prefsFrom,
  shouldAlert,
} from "@/services/notifications/preferences";
import {
  PUSH_TARGET_SELECT,
  pushConfigured,
  pushTargetsOf,
} from "@/services/push/targets";
import { deliverPush } from "@/services/reminders/reminder-delivery";
import { HabitKind } from "@prisma/client";
import { randomUUID } from "crypto";

import { newDate } from "@/lib/date-utils";
import { rolloutBucket } from "@/lib/feature-flags";
import { HABIT_EVENING_PUSH } from "@/lib/feature-flags-keys";
import { calendarDaysBetweenKeys } from "@/lib/habits-quit";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { type LocalClock, habitRunsToday, localClock } from "./presence";

/**
 * The evening habit push (flag `habit_evening_push`): at 20:00 in the
 * person's own zone, "3 habits left today", and only when habits are really
 * left. One per person per day (the `HabitPush` unique row is the claim, taken
 * before sending), never to a person with no device subscribed, and off when
 * the person switched it off (`UserSettings.prefs.habitEveningPush`).
 *
 * The preference has three states and the third is the point: `true` and
 * `false` are the person's choice; absent means "default", which is ON only
 * because the sweep reaches nobody without a push subscription. Nothing is
 * ever written for a person who did not choose, so the default cannot turn on
 * for someone who has no subscription.
 */
export const EVENING_TIME = "20:00";
/** The push goes out in the first sweep inside this window after 20:00. */
export const EVENING_WINDOW_MIN = 30;
export const EVENING_KIND = "evening";
export const EVENING_PREF_KEY = "habitEveningPush";

const LOG_SOURCE = "HabitEveningPush";
const USERS_PER_PAGE = 200;
const MAX_PAGES = 500;
const HABITS_URL = "/habits";
/** A `quota`-per-week habit is measured over the last seven days. */
const WEEK_DAYS = 7;

/* ---------- pure rules ---------- */

/** 20:00 up to (not including) 20:30 on the person's local clock. */
export function inEveningWindow(clock: LocalClock): boolean {
  const start = 20 * 60;
  return clock.minutes >= start && clock.minutes < start + EVENING_WINDOW_MIN;
}

/**
 * Whether the person gets the push. A stored boolean is their choice; with
 * nothing stored the default is on only when a push device is subscribed.
 */
export function eveningEnabled(
  stored: unknown,
  hasSubscription: boolean
): boolean {
  if (typeof stored === "boolean") return stored;
  return hasSubscription;
}

/** `UserSettings.prefs.habitEveningPush`, or undefined when never chosen. */
export function eveningPrefOf(prefs: unknown): boolean | undefined {
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) {
    return undefined;
  }
  const value = (prefs as Record<string, unknown>)[EVENING_PREF_KEY];
  return typeof value === "boolean" ? value : undefined;
}

export interface EveningHabit {
  daysOfWeek: readonly number[];
  /** A per-week quota; null = every day it runs. */
  quota: number | null;
  /** Completion days as yyyy-MM-dd, at least the last seven. */
  completionKeys: readonly string[];
}

/**
 * How many habits are still to do today: they run today, are not kept yet,
 * and (for a per-week quota) the last seven days have not met the quota. It is
 * the number the card stack shows, so the push and the screen agree.
 */
export function openHabitCount(
  habits: readonly EveningHabit[],
  clock: LocalClock
): number {
  return habits.filter((habit) => {
    if (!habitRunsToday(habit.daysOfWeek, clock)) return false;
    if (habit.completionKeys.includes(clock.dayKey)) return false;
    if (habit.quota) {
      const week = habit.completionKeys.filter((key) => {
        const back = calendarDaysBetweenKeys(key, clock.dayKey);
        return key <= clock.dayKey && back < WEEK_DAYS;
      }).length;
      if (week >= habit.quota) return false;
    }
    return true;
  }).length;
}

export function eveningText(open: number) {
  return {
    title: "Habits",
    body: open === 1 ? "1 habit left today" : `${open} habits left today`,
  };
}

export const eveningTag = (dayKey: string) => `evening:${dayKey}`;

/* ---------- the sweep ---------- */

interface FlagState {
  enabled: boolean;
  rolloutPercentage: number;
  overrides: Map<string, boolean>;
}

/** The flag, read once per run. null = off for everybody. */
async function loadFlag(): Promise<FlagState | null> {
  const flag = await prisma.featureFlag.findUnique({
    where: { key: HABIT_EVENING_PUSH },
    select: {
      enabled: true,
      rolloutPercentage: true,
      overrides: { select: { userId: true, enabled: true } },
    },
  });
  if (!flag) return null;
  const overrides = new Map(flag.overrides.map((o) => [o.userId, o.enabled]));
  if (!flag.enabled && ![...overrides.values()].some(Boolean)) return null;
  return {
    enabled: flag.enabled,
    rolloutPercentage: flag.rolloutPercentage,
    overrides,
  };
}

/** The same rule as `isFeatureEnabled`, against the state read once. */
function flagOn(flag: FlagState, userId: string) {
  const override = flag.overrides.get(userId);
  if (override !== undefined) return override;
  if (!flag.enabled) return false;
  return rolloutBucket(HABIT_EVENING_PUSH, userId) < flag.rolloutPercentage;
}

/**
 * Takes the day's one push. The unique row is the dedup, taken before
 * sending, so two sweeps (or two workers) cannot both send. null = taken.
 */
async function claim(userId: string, dayKey: string) {
  const id = randomUUID();
  const { count } = await prisma.habitPush.createMany({
    data: [
      { id, userId, habitId: null, scope: "user", kind: EVENING_KIND, dayKey },
    ],
    skipDuplicates: true,
  });
  return count > 0 ? id : null;
}

type Person = Parameters<typeof pushTargetsOf>[0] & { id: string };

async function sendTo(person: Person, dayKey: string, open: number) {
  const claimId = await claim(person.id, dayKey);
  if (!claimId) return false;
  const text = eveningText(open);
  const results = await Promise.allSettled(
    pushTargetsOf(person).map((target) =>
      deliverPush(target, {
        title: text.title,
        body: text.body,
        url: HABITS_URL,
        tag: eveningTag(dayKey),
      })
    )
  );
  const delivered = results.some(
    (result) => result.status === "fulfilled" && result.value
  );
  if (!delivered) {
    // Nothing reached a device: give the claim back so the next sweep inside
    // the window may try again.
    await prisma.habitPush.delete({ where: { id: claimId } }).catch(() => null);
    return false;
  }
  return true;
}

async function sweepPage(people: Person[], flag: FlagState, now: Date) {
  const enabledPeople = people.filter(
    (person) => flagOn(flag, person.id) && pushTargetsOf(person).length > 0
  );
  if (enabledPeople.length === 0) return 0;
  const ids = enabledPeople.map((person) => person.id);
  const [settingRows, userRows] = await Promise.all([
    prisma.notificationSettings.findMany({ where: { userId: { in: ids } } }),
    prisma.userSettings.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, timeZone: true, prefs: true },
    }),
  ]);
  const settingsOf = new Map(settingRows.map((row) => [row.userId, row]));
  const userOf = new Map(userRows.map((row) => [row.userId, row]));

  // Each person's own clock decides who is worth loading further.
  const due = new Map<
    string,
    { clock: LocalClock; prefs: NotificationPrefs }
  >();
  for (const person of enabledPeople) {
    const user = userOf.get(person.id);
    // No stored zone: never guess one; 20:00 somewhere else is not 20:00.
    if (!user?.timeZone) continue;
    if (!eveningEnabled(eveningPrefOf(user.prefs), true)) continue;
    const prefs = prefsFrom(settingsOf.get(person.id) ?? null, user.timeZone);
    const clock = localClock(now, prefs.timeZone);
    if (!inEveningWindow(clock)) continue;
    // Quiet hours, the digest, the push channel and the Reminders switch.
    if (!shouldAlert(prefs, "reminder", "push", now)) continue;
    due.set(person.id, { clock, prefs });
  }
  if (due.size === 0) return 0;

  const since = newDate(now.getTime() - (WEEK_DAYS + 1) * 86_400_000);
  const habitRows = await prisma.habit.findMany({
    where: {
      userId: { in: [...due.keys()] },
      archivedAt: null,
      isActive: true,
      isSample: false,
      kind: HabitKind.BUILD,
    },
    select: {
      userId: true,
      daysOfWeek: true,
      quota: true,
      completions: { where: { date: { gte: since } }, select: { date: true } },
    },
  });
  const byUser = new Map<string, EveningHabit[]>();
  for (const row of habitRows) {
    const list = byUser.get(row.userId) ?? [];
    list.push({
      daysOfWeek: row.daysOfWeek,
      quota: row.quota,
      completionKeys: row.completions.map((c) =>
        c.date.toISOString().slice(0, 10)
      ),
    });
    byUser.set(row.userId, list);
  }

  let pushed = 0;
  for (const person of enabledPeople) {
    const entry = due.get(person.id);
    if (!entry) continue;
    const open = openHabitCount(byUser.get(person.id) ?? [], entry.clock);
    if (open === 0) continue;
    try {
      if (await sendTo(person, entry.clock.dayKey, open)) pushed += 1;
    } catch (error) {
      await logger.error(
        "Habit evening push failed",
        {
          userId: person.id,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
    }
  }
  return pushed;
}

/** The zones (of those given) where it is 20:00-20:29 right now. */
export function zonesInEveningWindow(
  zones: readonly string[],
  now: Date
): string[] {
  return zones.filter((zone) => inEveningWindow(localClock(now, zone)));
}

/**
 * The stored zones that are inside the window now. Read from the zones people
 * actually saved (a handful of distinct values), not from a list of every
 * zone, so an alias such as "Europe/Kiev" is never missed.
 */
const ZONES_TTL_MS = 3_600_000;
let zoneCache: { at: number; zones: string[] } | null = null;

/** Tests only: forget the cached zone list. */
export function resetZoneCache() {
  zoneCache = null;
}

async function dueZones(now: Date): Promise<string[]> {
  // The distinct zones change rarely: read them at most once an hour.
  if (!zoneCache || now.getTime() - zoneCache.at >= ZONES_TTL_MS) {
    const rows = await prisma.userSettings.groupBy({ by: ["timeZone"] });
    zoneCache = {
      at: now.getTime(),
      zones: rows.map((row) => row.timeZone).filter(Boolean),
    };
  }
  return zonesInEveningWindow(zoneCache.zones, now);
}

/**
 * The sweep the worker runs every few minutes. With the flag off for
 * everybody it reads one row and returns; no person is loaded.
 */
export async function runHabitEveningPush(now = newDate()) {
  if (!pushConfigured()) return { users: 0, pushed: 0 };
  const flag = await loadFlag();
  if (!flag) return { users: 0, pushed: 0 };
  // Nobody's clock is inside the window: no person is read at all.
  const zones = await dueZones(now);
  if (zones.length === 0) return { users: 0, pushed: 0 };
  // Disabled for everybody except the overrides: only they can be reached.
  const onlyIds = flag.enabled
    ? null
    : [...flag.overrides].filter(([, on]) => on).map(([id]) => id);

  let cursor: string | undefined;
  let users = 0;
  let pushed = 0;
  for (let page = 0; ; page += 1) {
    if (page >= MAX_PAGES) {
      await logger.warn(
        "Habit evening push stopped at the page cap",
        { pages: page, users },
        LOG_SOURCE
      );
      break;
    }
    const rows = await prisma.user.findMany({
      where: {
        ...(onlyIds ? { id: { in: onlyIds } } : {}),
        // In a due zone, and without today's claim (that zone's dayKey):
        // a push already sent is not loaded again by later sweeps.
        AND: [
          {
            OR: zones.map((zone) => ({
              userSettings: { is: { timeZone: zone } },
              HabitPush: {
                none: {
                  kind: EVENING_KIND,
                  dayKey: localClock(now, zone).dayKey,
                },
              },
            })),
          },
        ],
        habits: {
          some: {
            archivedAt: null,
            isActive: true,
            isSample: false,
            kind: HabitKind.BUILD,
          },
        },
        OR: [
          { pushSubscriptions: { some: {} } },
          { nativePushTokens: { some: {} } },
        ],
      },
      orderBy: { id: "asc" },
      take: USERS_PER_PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, ...PUSH_TARGET_SELECT },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    pushed += await sweepPage(rows as Person[], flag, now);
    users += rows.length;
    if (rows.length < USERS_PER_PAGE) break;
  }
  return { users, pushed };
}
