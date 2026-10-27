/* WHETHER TO INTERRUPT SOMEONE — Settings → Notifications, read on the server
 * before anything is sent. The bell is the record and always shows
 * everything; these rules decide which of it also becomes a push, a Mac
 * notification, an email or an in-app notice.
 *
 *   type      reminders · overdue (`nudges`) · mentions & shares · weekly
 *             check-ins (`weeklyReview`) · system · focus ended
 *   channel   inApp · push · mac · email (`emailNotifications`)
 *   quiet     between quietStart and quietEnd nothing interrupts; it waits
 *             in the bell
 *   digest    instead of a stream: one summary at digestTime, nothing else
 *
 * The pure parts take the settings row and a time, so they are tested
 * without a database.
 */
import { formatInTimeZone, fromZonedTime } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { TIME_OF_DAY, safeZone } from "../reminders/reminder-time";

export type NotificationType =
  | "reminder"
  | "overdue"
  | "mention"
  | "weekly"
  | "system"
  | "focus";

export type NotificationChannel = "inApp" | "push" | "mac" | "email";

export interface NotificationPrefs {
  reminders: boolean;
  nudges: boolean;
  mentions: boolean;
  weeklyReview: boolean;
  system: boolean;
  focusEnded: boolean;
  channelInApp: boolean;
  channelPush: boolean;
  channelMac: boolean;
  emailNotifications: boolean;
  quietHours: boolean;
  quietStart: string;
  quietEnd: string;
  digest: boolean;
  digestTime: string;
  timeZone: string;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  reminders: true,
  nudges: false,
  mentions: true,
  weeklyReview: true,
  system: true,
  focusEnded: true,
  channelInApp: true,
  channelPush: true,
  channelMac: true,
  emailNotifications: true,
  quietHours: false,
  quietStart: "22:00",
  quietEnd: "08:00",
  digest: false,
  digestTime: "08:00",
  timeZone: "UTC",
};

const TYPE_FIELD: Record<NotificationType, keyof NotificationPrefs> = {
  reminder: "reminders",
  overdue: "nudges",
  mention: "mentions",
  weekly: "weeklyReview",
  system: "system",
  focus: "focusEnded",
};

const CHANNEL_FIELD: Record<NotificationChannel, keyof NotificationPrefs> = {
  inApp: "channelInApp",
  push: "channelPush",
  mac: "channelMac",
  email: "emailNotifications",
};

/** The type a feed row belongs to, for the toggles above. */
export function typeOfFeedKind(kind: string): NotificationType {
  switch (kind) {
    case "reminder":
    case "due":
      return "reminder";
    case "overdue":
    case "nudge":
      return "overdue";
    case "comment":
    case "share":
      return "mention";
    default:
      return "system";
  }
}

function minutesOf(hhmm: string): number | null {
  if (!TIME_OF_DAY.test(hhmm)) return null;
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

/** True inside quiet hours. A window may cross midnight (22:00 → 08:00). */
export function inQuietHours(
  prefs: Pick<
    NotificationPrefs,
    "quietHours" | "quietStart" | "quietEnd" | "timeZone"
  >,
  now: Date
): boolean {
  if (!prefs.quietHours) return false;
  const start = minutesOf(prefs.quietStart);
  const end = minutesOf(prefs.quietEnd);
  if (start === null || end === null || start === end) return false;
  const local = formatInTimeZone(now, safeZone(prefs.timeZone), "HH:mm");
  const m = minutesOf(local) ?? 0;
  return start < end ? m >= start && m < end : m >= start || m < end;
}

/**
 * Whether something of this type may interrupt on this channel now. The
 * digest takes every channel but in-app: its one summary is sent by
 * deliverDailyDigests.
 */
export function shouldAlert(
  prefs: NotificationPrefs,
  type: NotificationType,
  channel: NotificationChannel,
  now: Date
): boolean {
  if (!prefs[TYPE_FIELD[type]]) return false;
  if (!prefs[CHANNEL_FIELD[channel]]) return false;
  if (channel === "inApp") return true;
  if (prefs.digest) return false;
  return !inQuietHours(prefs, now);
}

/** Today's digest moment in the person's zone. */
export function digestMoment(
  prefs: Pick<NotificationPrefs, "digestTime" | "timeZone">,
  now: Date
): Date {
  const zone = safeZone(prefs.timeZone);
  const time = TIME_OF_DAY.test(prefs.digestTime) ? prefs.digestTime : "08:00";
  const day = formatInTimeZone(now, zone, "yyyy-MM-dd");
  return fromZonedTime(`${day}T${time}:00.000`, zone);
}

/** The digest is due once a day, at or after its time, if not sent since. */
export function digestDue(
  prefs: Pick<NotificationPrefs, "digest" | "digestTime" | "timeZone">,
  lastDigestAt: Date | null,
  now: Date
): boolean {
  if (!prefs.digest) return false;
  const moment = digestMoment(prefs, now);
  if (now < moment) return false;
  return !lastDigestAt || lastDigestAt < moment;
}

type SettingsRow = Partial<Omit<NotificationPrefs, "timeZone">> | null;

export function prefsFrom(
  row: SettingsRow,
  timeZone: string | null | undefined
): NotificationPrefs {
  const out = { ...DEFAULT_PREFS, timeZone: safeZone(timeZone) };
  if (!row) return out;
  for (const key of Object.keys(DEFAULT_PREFS) as (keyof NotificationPrefs)[]) {
    if (key === "timeZone") continue;
    const value = (row as Record<string, unknown>)[key];
    if (typeof value === typeof DEFAULT_PREFS[key]) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

export async function getNotificationPrefs(
  userId: string
): Promise<NotificationPrefs> {
  const [row, settings] = await Promise.all([
    prisma.notificationSettings.findUnique({ where: { userId } }),
    prisma.userSettings.findUnique({
      where: { userId },
      select: { timeZone: true },
    }),
  ]);
  return prefsFrom(row, settings?.timeZone);
}
