import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import {
  CATEGORY_DEFAULTS,
  LEGACY_OPT_OUT_CATEGORIES,
  OPTIONAL_CATEGORIES,
  type OptionalCategory,
  type PreferenceSource,
} from "./categories";

export type CategoryState = Record<OptionalCategory, boolean>;

export type EmailPreferences = {
  categories: CategoryState;
  /** "Fewer emails": the cap window is 7 days instead of 3. */
  fewer: boolean;
  /** `NotificationSettings.emailNotifications` is off: every optional mail is paused. */
  paused: boolean;
};

type Row = { category: string; enabled: boolean };

/**
 * Pure: turns stored rows into the state of each category. A row wins; with
 * no row the legacy opt-out column switches tips, offers and updates off;
 * otherwise the default applies.
 */
export function resolveCategories(
  rows: readonly Row[],
  legacyOptOut: boolean
): CategoryState {
  const state = { ...CATEGORY_DEFAULTS };
  for (const category of OPTIONAL_CATEGORIES) {
    if (legacyOptOut && LEGACY_OPT_OUT_CATEGORIES.includes(category)) {
      state[category] = false;
    }
  }
  for (const row of rows) {
    if ((OPTIONAL_CATEGORIES as readonly string[]).includes(row.category)) {
      state[row.category as OptionalCategory] = row.enabled;
    }
  }
  return state;
}

export async function getPreferences(
  userId: string
): Promise<EmailPreferences | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      commercialEmailsOptOutAt: true,
      emailFewer: true,
      emailPreferences: { select: { category: true, enabled: true } },
      notificationSettings: { select: { emailNotifications: true } },
    },
  });
  if (!user) return null;
  return {
    categories: resolveCategories(
      user.emailPreferences,
      Boolean(user.commercialEmailsOptOutAt)
    ),
    fewer: user.emailFewer,
    paused: user.notificationSettings?.emailNotifications === false,
  };
}

/** True when an optional mail of this category may go to the person now. */
export async function isCategoryEnabled(
  userId: string,
  category: OptionalCategory
): Promise<boolean> {
  const preferences = await getPreferences(userId);
  if (!preferences || preferences.paused) return false;
  return preferences.categories[category];
}

export async function setCategory(
  userId: string,
  category: OptionalCategory,
  enabled: boolean,
  source: PreferenceSource
): Promise<void> {
  await prisma.emailPreference.upsert({
    where: { userId_category: { userId, category } },
    create: { userId, category, enabled, source },
    update: { enabled, source, updatedAt: newDate() },
  });
}

export async function setCategories(
  userId: string,
  categories: readonly OptionalCategory[],
  enabled: boolean,
  source: PreferenceSource
): Promise<void> {
  for (const category of categories) {
    await setCategory(userId, category, enabled, source);
  }
}

/** Every optional category off (complaint, sunset, "unsubscribe from all"). */
export async function switchOffAllOptional(
  userId: string,
  source: PreferenceSource
): Promise<void> {
  await setCategories(userId, OPTIONAL_CATEGORIES, false, source);
}

export async function setFewerEmails(
  userId: string,
  fewer: boolean
): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId },
    data: { emailFewer: fewer },
  });
}

/**
 * One-time backfill for accounts that opted out before the categories
 * existed: writes the rows with source `legacy` so the state is explicit.
 * Reads already treat the column as off, so running it is optional.
 */
export async function backfillLegacyOptOuts(batch = 500): Promise<number> {
  const users = await prisma.user.findMany({
    where: { commercialEmailsOptOutAt: { not: null } },
    select: { id: true },
    take: batch,
  });
  for (const user of users) {
    for (const category of LEGACY_OPT_OUT_CATEGORIES) {
      await prisma.emailPreference.upsert({
        where: { userId_category: { userId: user.id, category } },
        create: { userId: user.id, category, enabled: false, source: "legacy" },
        update: {},
      });
    }
  }
  return users.length;
}

/** Marks the latest "still want these?" mail as answered (the keep button). */
export async function recordKeep(
  userId: string,
  now: Date = newDate()
): Promise<void> {
  await prisma.emailSend.updateMany({
    where: { userId, ruleKey: "still-want", status: "sent", keptAt: null },
    data: { keptAt: now },
  });
}
