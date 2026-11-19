/* THE DAY PLAN'S TWO TOUCHES (reminder queue, kind "day-plan-touch").
 *
 * A morning plan and an evening "close the day", at the person's own local
 * times (defaults 08:00 and 21:00), each at most once per local day. Nothing
 * else the plan system does is sent as a notification (D7).
 *
 * Idempotence is a compare-and-set on PlanSettings.lastMorningAt /
 * lastEveningAt taken before sending: it succeeds only when the touch was not
 * sent since local midnight of today in the person's zone. It is per local DAY,
 * not per window, so moving the time, changing the zone or a repeated DST hour
 * cannot send a second one. The due window is [time, time+30min) so a missed
 * sweep catches up and a released claim can retry.
 *
 * Every touch leaves through `sendDayPlanTouch`, the one place a channel is
 * added.
 */
import { configuredAdapters } from "@/services/channels/registry";
import {
  PUSH_TARGET_SELECT,
  loadPushTargets,
  pushConfigured,
  pushTargetsOf,
} from "@/services/push/targets";
import { deliverPush } from "@/services/reminders/reminder-delivery";

import {
  formatInTimeZone,
  newDate,
  startOfDayInTimeZone,
} from "@/lib/date-utils";
import { dayPlanTouchesEnabled } from "@/lib/feature-flags";
import { DAY_PLAN, DAY_PLAN_TOUCHES } from "@/lib/feature-flags-keys";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { buildTouchMessage } from "../channels/render";
import { sendChannelTouch } from "../channels/touch";
import { inQuietHours, prefsFrom } from "../notifications/preferences";
import { activateDayPlan, buildDraft, getDayPlan } from "./plan";
import { addDaysToKey } from "./rules";

const LOG_SOURCE = "DayPlanTouches";
const USERS_PER_PAGE = 200;
const MAX_PAGES = 500;
/** Same catch-up window as the habit evening push. */
export const TOUCH_WINDOW_MIN = 30;
export const TODAY_URL = "/today";
export const MAIN_NAMES = 3;
const ZONES_TTL_MS = 3_600_000;

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

/** True for a zone Intl knows; a stored bad zone is skipped, never guessed. */
export function isValidZone(zone: string | null | undefined): zone is string {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(newDate());
    return true;
  } catch {
    return false;
  }
}

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

/** `time` up to (not including) `time` + 30 minutes on the local clock. */
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

/** Web and native push to every device of the person. */
async function sendPushChannels(
  userId: string,
  kind: TouchKind,
  payload: TouchPayload
) {
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

/** Linked messenger chats, with the plan's text and done/later actions. */
async function sendMessengerChannels(
  userId: string,
  kind: TouchKind,
  now: Date | undefined
) {
  try {
    const message = await buildTouchMessage(userId, kind, now);
    return (await sendChannelTouch(userId, message)) > 0;
  } catch (error) {
    await logger.warn(
      "Messenger touch failed",
      {
        userId,
        kind,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return false;
  }
}

/**
 * Sends one logical touch to every channel the person has: web and native
 * push (unless `push` is false) and linked messenger chats. It is ONE touch:
 * true when at least one channel delivered, so the caller keeps its claim, and
 * false only when every channel failed or there was none.
 */
export async function sendDayPlanTouch(
  userId: string,
  kind: TouchKind,
  payload: TouchPayload,
  options: { push?: boolean; now?: Date } = {}
): Promise<boolean> {
  const [pushed, chatted] = await Promise.all([
    options.push === false
      ? false
      : sendPushChannels(userId, kind, payload).catch(() => false),
    sendMessengerChannels(userId, kind, options.now),
  ]);
  return pushed || chatted;
}

/**
 * True when today's morning touch was claimed and sent for this person, and
 * the digest at `digestTime` is a morning one. Only then does the morning
 * digest leave its push out (its email never moves). The claim of a touch that
 * had nothing to say or failed is given back, so a set `lastMorningAt` inside
 * today's local day means it went out.
 */
export async function morningTouchCoversDigest(
  userId: string,
  digest: { digestTime: string; timeZone: string },
  now: Date
): Promise<boolean> {
  if (!TIME_OF_DAY.test(digest.digestTime)) return false;
  if (minutesOf(digest.digestTime) >= 12 * 60) return false;
  if (!isValidZone(digest.timeZone)) return false;
  if (!(await dayPlanTouchesEnabled(userId))) return false;
  const row = await prisma.planSettings.findUnique({
    where: { userId },
    select: { lastMorningAt: true },
  });
  const sent = row?.lastMorningAt;
  return Boolean(
    sent &&
      sent.getTime() >= startOfDayInTimeZone(now, digest.timeZone).getTime()
  );
}

/* ---------- compare-and-set ---------- */

const fieldOf = (kind: TouchKind) =>
  kind === "morning" ? "lastMorningAt" : "lastEveningAt";

/**
 * Takes the day's touch: succeeds only if it was not sent since local midnight
 * of today. The row is created first (schema defaults) so a person with no
 * stored settings is covered too.
 */
async function claim(
  userId: string,
  kind: TouchKind,
  localMidnight: Date,
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
      OR: [{ [field]: null }, { [field]: { lt: localMidnight } }],
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

type Person = Parameters<typeof pushTargetsOf>[0] & {
  id: string;
  channelLinks?: { id: string }[];
};

async function touchPerson(
  person: Person,
  kind: TouchKind,
  zone: string,
  clock: { dayKey: string; minutes: number },
  now: Date,
  push: boolean
) {
  if (!(await dayPlanTouchesEnabled(person.id))) return false;
  const taken = await claim(
    person.id,
    kind,
    startOfDayInTimeZone(now, zone),
    now
  );
  if (!taken) return false;
  try {
    const payload =
      kind === "morning"
        ? await composeMorning(person.id, clock.dayKey, now)
        : await composeEvening(person.id, clock.dayKey, now);
    if (!payload) {
      // Nothing to say. A morning claim is given back so `lastMorningAt` only
      // ever means "sent" (the digest relies on it); the evening one stays.
      if (kind === "morning")
        await release(person.id, kind, now, taken.previous);
      return false;
    }
    const delivered = await sendDayPlanTouch(
      person.id,
      kind,
      { ...payload, tag: `day-plan:${kind}:${clock.dayKey}` },
      { push, now }
    );
    if (!delivered) await release(person.id, kind, now, taken.previous);
    return delivered;
  } catch (error) {
    await release(person.id, kind, now, taken.previous);
    throw error;
  }
}

async function sweepPerson(
  person: Person,
  settings:
    | {
        morningTime: string;
        eveningTime: string;
        morningOn: boolean;
        eveningOn: boolean;
      }
    | undefined,
  zone: string,
  notification: Parameters<typeof prefsFrom>[0],
  now: Date
) {
  const clock = localMoment(now, zone);
  const prefs = prefsFrom(notification, zone);
  if (inQuietHours(prefs, now)) return 0;
  // Push needs the channel on and a device; a linked chat needs neither.
  const canPush = prefs.channelPush && pushTargetsOf(person).length > 0;
  if (!canPush && !(person.channelLinks?.length ?? 0)) return 0;
  let sent = 0;
  for (const kind of ["morning", "evening"] as const) {
    const on = settings ? settings[`${kind}On`] : true;
    if (!on) continue;
    const time = settings?.[`${kind}Time`] ?? DEFAULT_TIMES[kind];
    if (!inTouchWindow(clock.minutes, time)) continue;
    if (await touchPerson(person, kind, zone, clock, now, canPush)) sent += 1;
  }
  return sent;
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
    // No stored zone, or one Intl does not know: skip, never guess.
    const zone = zoneOf.get(person.id);
    if (!isValidZone(zone)) continue;
    try {
      sent += await sweepPerson(
        person,
        planOf.get(person.id),
        zone,
        notifOf.get(person.id) ?? null,
        now
      );
    } catch (error) {
      // One bad person must not stop the sweep.
      await logger.error(
        "Day plan touch failed",
        {
          userId: person.id,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
    }
  }
  return sent;
}

/* ---------- who to load ---------- */

interface FlagScope {
  /** null = on for everybody; a list = only these override users. */
  only: string[] | null;
}

/** The flag row once; null = off for everybody (no row is the shipping state). */
async function loadFlag(key: string): Promise<FlagScope | null> {
  const flag = await prisma.featureFlag.findUnique({
    where: { key },
    select: {
      enabled: true,
      overrides: { where: { enabled: true }, select: { userId: true } },
    },
  });
  if (!flag) return null;
  const ids = (flag.overrides ?? []).map((o: { userId: string }) => o.userId);
  if (flag.enabled) return { only: null };
  return ids.length > 0 ? { only: ids } : null;
}

async function flagScope(): Promise<FlagScope | null> {
  const plan = await loadFlag(DAY_PLAN);
  if (!plan) return null;
  const touches = await loadFlag(DAY_PLAN_TOUCHES);
  if (!touches) return null;
  if (!plan.only) return touches;
  if (!touches.only) return plan;
  const allowed = new Set(plan.only);
  const both = touches.only.filter((id) => allowed.has(id));
  return both.length > 0 ? { only: both } : null;
}

let zoneCache: { at: number; zones: string[] } | null = null;

/** Tests only: forget the cached zone list. */
export function resetTouchZoneCache() {
  zoneCache = null;
}

/** Stored zones where the default morning or evening window is open now. */
async function dueZones(now: Date): Promise<string[]> {
  if (!zoneCache || now.getTime() - zoneCache.at >= ZONES_TTL_MS) {
    const rows = await prisma.userSettings.groupBy({ by: ["timeZone"] });
    zoneCache = {
      at: now.getTime(),
      zones: rows.map((row) => row.timeZone).filter(isValidZone),
    };
  }
  return zoneCache.zones.filter((zone) => {
    const { minutes } = localMoment(now, zone);
    return (
      inTouchWindow(minutes, DEFAULT_TIMES.morning) ||
      inTouchWindow(minutes, DEFAULT_TIMES.evening)
    );
  });
}

export async function runDayPlanTouchSweep(now = newDate()) {
  if (!pushConfigured() && configuredAdapters().length === 0) {
    return { users: 0, sent: 0 };
  }
  const scope = await flagScope();
  if (!scope) return { users: 0, sent: 0 };
  const zones = await dueZones(now);

  let cursor: string | undefined;
  let users = 0;
  let sent = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await prisma.user.findMany({
      where: {
        ...(scope.only ? { id: { in: scope.only } } : {}),
        AND: [
          {
            // Default times: only zones whose window is open. Custom times
            // are rare and cannot be pre-filtered by zone, so those people
            // are always looked at.
            OR: [
              ...(zones.length > 0
                ? [{ userSettings: { is: { timeZone: { in: zones } } } }]
                : []),
              {
                planSettings: {
                  is: {
                    OR: [
                      { morningTime: { not: DEFAULT_TIMES.morning } },
                      { eveningTime: { not: DEFAULT_TIMES.evening } },
                    ],
                  },
                },
              },
            ],
          },
          {
            OR: [
              { pushSubscriptions: { some: {} } },
              { nativePushTokens: { some: {} } },
              { channelLinks: { some: { unlinkedAt: null } } },
            ],
          },
        ],
      },
      orderBy: { id: "asc" },
      take: USERS_PER_PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        ...PUSH_TARGET_SELECT,
        channelLinks: {
          where: { unlinkedAt: null },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    sent += await sweepPage(rows as Person[], now);
    users += rows.length;
    if (rows.length < USERS_PER_PAGE) break;
  }
  return { users, sent };
}
