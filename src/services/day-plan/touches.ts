/* THE DAY PLAN'S TWO TOUCHES (reminder queue, kind "day-plan-touch").
 *
 * A morning plan and an evening "close the day", at the person's own local
 * times (defaults 08:00 and 21:00), each at most once per local day. Nothing
 * else the plan system does is sent as a notification (D7). Idempotence is a
 * compare-and-set on PlanSettings.lastMorningAt / lastEveningAt, taken before
 * sending, so restarts and overlapping sweeps cannot send twice.
 *
 * Every touch leaves through `sendDayPlanTouch`, the one place a channel is
 * added (messengers join it in a later PR).
 */
import {
  PUSH_TARGET_SELECT,
  loadPushTargets,
  pushConfigured,
  pushTargetsOf,
} from "@/services/push/targets";
import { deliverPush } from "@/services/reminders/reminder-delivery";
import { formatInTimeZone } from "date-fns-tz";

import { newDate } from "@/lib/date-utils";
import { dayPlanEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { inQuietHours, prefsFrom } from "../notifications/preferences";
import { activateDayPlan, buildDraft, getDayPlan } from "./plan";
import { addDaysToKey } from "./rules";

const LOG_SOURCE = "DayPlanTouches";
const USERS_PER_PAGE = 200;
const MAX_PAGES = 500;
export const TOUCH_WINDOW_MIN = 5;
export const TODAY_URL = "/today";
export const MAIN_NAMES = 3;

export type TouchKind = "morning" | "evening";

export interface TouchPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export const DEFAULT_TIMES = { morning: "08:00", evening: "21:00" } as const;
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

const minutesOf = (hhmm: string) =>
  Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Minutes since local midnight and the local day key, in the given zone. */
export function localMoment(now: Date, timeZone: string) {
  const [hour, minute] = formatInTimeZone(now, timeZone, "HH:mm")
    .split(":")
    .map(Number);
  return {
    dayKey: formatInTimeZone(now, timeZone, "yyyy-MM-dd"),
    minutes: hour * 60 + minute,
  };
}

/** `time` up to (not including) `time` + 5 minutes on the local clock. */
export function inTouchWindow(minutes: number, time: string): boolean {
  if (!TIME_OF_DAY.test(time)) return false;
  const start = minutesOf(time);
  return minutes >= start && minutes < start + TOUCH_WINDOW_MIN;
}

/* ---------- content ---------- */

export function morningText(titles: string[], total: number): TouchPayload {
  const shown = titles.slice(0, MAIN_NAMES);
  const more = Math.max(0, total - shown.length);
  const names = shown.join(", ");
  return {
    title: "Today",
    body: more > 0 ? `${names} +${more}` : names,
    url: TODAY_URL,
  };
}

export function eveningText(unfinished: number): TouchPayload {
  return {
    title: "Close the day",
    body:
      unfinished === 0
        ? "Everything planned is done. Close the day."
        : `${unfinished} planned ${unfinished === 1 ? "task" : "tasks"} left. Close the day.`,
    url: TODAY_URL,
  };
}

/* ---------- the one fan-out ---------- */

/**
 * Sends one logical touch to every channel the person has. Today that is web
 * and native push; a messenger joins here. True when at least one channel
 * delivered.
 */
export async function sendDayPlanTouch(
  userId: string,
  kind: TouchKind,
  payload: TouchPayload
): Promise<boolean> {
  const targets = await loadPushTargets(userId);
  const results = await Promise.allSettled(
    targets.map((target) =>
      deliverPush(target, {
        ...payload,
        tag: payload.tag ?? `day-plan:${kind}`,
      })
    )
  );
  return results.some(
    (result) => result.status === "fulfilled" && result.value
  );
}

/**
 * True when the morning touch takes the place of the old morning digest for
 * this person: the plan system is on for them and the morning touch is not
 * switched off. Defaults to on when they never stored settings.
 */
export async function morningTouchReplacesDigest(
  userId: string
): Promise<boolean> {
  if (!(await dayPlanEnabled(userId))) return false;
  const row = await prisma.planSettings.findUnique({
    where: { userId },
    select: { morningOn: true },
  });
  return row?.morningOn ?? true;
}

/* ---------- compare-and-set ---------- */

const fieldOf = (kind: TouchKind) =>
  kind === "morning" ? "lastMorningAt" : "lastEveningAt";

/**
 * Takes the day's touch: succeeds only if it was not sent since the start of
 * this local window. The row is created first (schema defaults) so a person
 * with no stored settings is covered too.
 */
async function claim(
  userId: string,
  kind: TouchKind,
  windowStart: Date,
  now: Date
): Promise<{ previous: Date | null } | null> {
  const field = fieldOf(kind);
  await prisma.planSettings.createMany({
    data: [{ userId }],
    skipDuplicates: true,
  });
  const before = await prisma.planSettings.findUnique({
    where: { userId },
    select: { lastMorningAt: true, lastEveningAt: true },
  });
  const previous = before?.[field] ?? null;
  const { count } = await prisma.planSettings.updateMany({
    where: {
      userId,
      OR: [{ [field]: null }, { [field]: { lt: windowStart } }],
    },
    data: { [field]: now },
  });
  return count > 0 ? { previous } : null;
}

async function release(
  userId: string,
  kind: TouchKind,
  now: Date,
  previous: Date | null
) {
  const field = fieldOf(kind);
  await prisma.planSettings
    .updateMany({
      where: { userId, [field]: now },
      data: { [field]: previous },
    })
    .catch(() => null);
}

/* ---------- composing one touch ---------- */

async function composeMorning(
  userId: string,
  dayKey: string,
  now: Date
): Promise<TouchPayload | null> {
  let snapshot = await getDayPlan(userId, dayKey, now);
  if (!snapshot.plan || snapshot.plan.items.length === 0) {
    const built = await buildDraft(userId, dayKey, { now });
    if (built.plan.items.length === 0) return null;
    snapshot = await getDayPlan(userId, dayKey, now);
  }
  const plan = snapshot.plan;
  if (!plan || plan.items.length === 0) return null;
  await activateDayPlan(userId, dayKey);
  const open = plan.items.filter(
    (item) => item.status !== "completed" && !item.resolution
  );
  if (open.length === 0) return null;
  const mains = open.filter((item) => item.isMain);
  const named = (mains.length > 0 ? mains : open).slice(0, MAIN_NAMES);
  return morningText(
    named.map((item) => item.title),
    open.length
  );
}

async function composeEvening(
  userId: string,
  dayKey: string,
  now: Date
): Promise<TouchPayload | null> {
  // Tomorrow's draft is built on every evening send, so it is waiting.
  try {
    await buildDraft(userId, addDaysToKey(dayKey, 1), { now });
  } catch (error) {
    await logger.warn(
      "Tomorrow's draft was not built",
      { userId, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
  }
  const { plan } = await getDayPlan(userId, dayKey, now);
  if (!plan || plan.status === "closed" || plan.items.length === 0) return null;
  const unfinished = plan.items.filter(
    (item) => item.status !== "completed" && !item.resolution
  ).length;
  return eveningText(unfinished);
}

/* ---------- the sweep ---------- */

type Person = Parameters<typeof pushTargetsOf>[0] & { id: string };

async function touchPerson(
  person: Person,
  kind: TouchKind,
  clock: { dayKey: string; minutes: number },
  time: string,
  now: Date
) {
  if (!(await dayPlanEnabled(person.id))) return false;
  const sinceWindow =
    (clock.minutes - minutesOf(time)) * 60_000 +
    now.getUTCSeconds() * 1000 +
    now.getUTCMilliseconds();
  const taken = await claim(
    person.id,
    kind,
    new Date(now.getTime() - sinceWindow),
    now
  );
  if (!taken) return false;
  try {
    const payload =
      kind === "morning"
        ? await composeMorning(person.id, clock.dayKey, now)
        : await composeEvening(person.id, clock.dayKey, now);
    // Nothing to say today: the claim stays, so it is not retried all window.
    if (!payload) return false;
    const delivered = await sendDayPlanTouch(person.id, kind, {
      ...payload,
      tag: `day-plan:${kind}:${clock.dayKey}`,
    });
    if (!delivered) await release(person.id, kind, now, taken.previous);
    return delivered;
  } catch (error) {
    await release(person.id, kind, now, taken.previous);
    await logger.error(
      "Day plan touch failed",
      {
        userId: person.id,
        kind,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return false;
  }
}

async function sweepPage(people: Person[], now: Date) {
  const ids = people.map((person) => person.id);
  const [planRows, userRows, notifRows] = await Promise.all([
    prisma.planSettings.findMany({
      where: { userId: { in: ids } },
      select: {
        userId: true,
        morningTime: true,
        eveningTime: true,
        morningOn: true,
        eveningOn: true,
      },
    }),
    prisma.userSettings.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, timeZone: true },
    }),
    prisma.notificationSettings.findMany({ where: { userId: { in: ids } } }),
  ]);
  const planOf = new Map(planRows.map((row) => [row.userId, row]));
  const zoneOf = new Map(userRows.map((row) => [row.userId, row.timeZone]));
  const notifOf = new Map(notifRows.map((row) => [row.userId, row]));

  let sent = 0;
  for (const person of people) {
    // No stored zone: never guess one.
    const zone = zoneOf.get(person.id);
    if (!zone) continue;
    const settings = planOf.get(person.id);
    const clock = localMoment(now, zone);
    const prefs = prefsFrom(notifOf.get(person.id) ?? null, zone);
    if (!prefs.channelPush || inQuietHours(prefs, now)) continue;
    for (const kind of ["morning", "evening"] as const) {
      const on = settings ? settings[`${kind}On`] : true;
      if (!on) continue;
      const time = settings?.[`${kind}Time`] ?? DEFAULT_TIMES[kind];
      if (!inTouchWindow(clock.minutes, time)) continue;
      if (await touchPerson(person, kind, clock, time, now)) sent += 1;
    }
  }
  return sent;
}

/** One row read when the flag cannot be on for anybody. */
async function flagMayBeOn() {
  const flag = await prisma.featureFlag.findUnique({
    where: { key: "day_plan" },
    select: {
      enabled: true,
      overrides: {
        where: { enabled: true },
        select: { userId: true },
        take: 1,
      },
    },
  });
  return Boolean(flag && (flag.enabled || flag.overrides.length > 0));
}

export async function runDayPlanTouchSweep(now = newDate()) {
  if (!pushConfigured()) return { users: 0, sent: 0 };
  if (!(await flagMayBeOn())) return { users: 0, sent: 0 };
  let cursor: string | undefined;
  let users = 0;
  let sent = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await prisma.user.findMany({
      where: {
        userSettings: { isNot: null },
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
    sent += await sweepPage(rows as Person[], now);
    users += rows.length;
    if (rows.length < USERS_PER_PAGE) break;
  }
  return { users, sent };
}
