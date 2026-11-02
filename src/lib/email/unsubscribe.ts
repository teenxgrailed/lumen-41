import { createHmac, timingSafeEqual } from "node:crypto";

import { authSecret } from "@/lib/auth/auth-secret";
import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import {
  LEGACY_OPT_OUT_CATEGORIES,
  OPTIONAL_CATEGORIES,
  type OptionalCategory,
  isOptionalCategory,
} from "./categories";
import { setCategories, switchOffAllOptional } from "./preferences";

/**
 * One-click unsubscribe for the emails that are not transactional.
 *
 * - "tips" | "offers" | "updates" | "recap": one optional category
 *   (src/lib/email/categories.ts), stored as an `EmailPreference` row.
 * - "all": every optional category above. The daily digest is untouched.
 * - "product": the older all-commercial category, still in links already in
 *   inboxes. Switches off tips, offers and updates and sets
 *   `User.commercialEmailsOptOutAt`.
 * - "digest": the daily summary. Turns `NotificationSettings.digest` off.
 *
 * The link carries a signed token and needs no login. It does not expire: a
 * mail from months ago must still work. It can only switch mail off.
 */
export type UnsubscribeCategory =
  | OptionalCategory
  | "all"
  | "product"
  | "digest";

const CATEGORIES: readonly UnsubscribeCategory[] = [
  ...OPTIONAL_CATEGORIES,
  "all",
  "product",
  "digest",
];

function signature(payload: string): string {
  return createHmac("sha256", authSecret())
    .update(`email-unsubscribe:${payload}`)
    .digest("base64url");
}

export function signUnsubscribeToken(
  userId: string,
  category: UnsubscribeCategory
): string {
  const payload = Buffer.from(
    JSON.stringify({ u: userId, c: category })
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyUnsubscribeToken(
  token: string | null | undefined
): { userId: string; category: UnsubscribeCategory } | null {
  if (!token) return null;
  const [payload, candidate] = token.split(".");
  if (!payload || !candidate) return null;
  const expected = Buffer.from(signature(payload));
  const given = Buffer.from(candidate);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { u?: unknown; c?: unknown };
    if (
      typeof claims.u !== "string" ||
      !claims.u ||
      !CATEGORIES.includes(claims.c as UnsubscribeCategory)
    ) {
      return null;
    }
    return { userId: claims.u, category: claims.c as UnsubscribeCategory };
  } catch {
    return null;
  }
}

function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

/** The absolute link that goes in the footer and the List-Unsubscribe header. */
export function unsubscribeUrl(
  userId: string,
  category: UnsubscribeCategory
): string {
  const url = new URL("/api/email/unsubscribe", appOrigin());
  url.searchParams.set("t", signUnsubscribeToken(userId, category));
  return url.toString();
}

/** Switches the category off. Idempotent; false when the account is gone. */
export async function applyUnsubscribe(
  userId: string,
  category: UnsubscribeCategory
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) return false;
  if (category === "digest") {
    await prisma.notificationSettings.updateMany({
      where: { userId },
      data: { digest: false },
    });
    return true;
  }
  if (category === "product" || category === "all") {
    await prisma.user.updateMany({
      where: { id: userId, commercialEmailsOptOutAt: null },
      data: { commercialEmailsOptOutAt: newDate() },
    });
    if (category === "all") {
      await switchOffAllOptional(userId, "unsubscribe-link");
    } else {
      await setCategories(
        userId,
        LEGACY_OPT_OUT_CATEGORIES,
        false,
        "unsubscribe-link"
      );
    }
    return true;
  }
  if (isOptionalCategory(category)) {
    await setCategories(userId, [category], false, "unsubscribe-link");
  }
  return true;
}

const ACCOUNT_MAIL_STILL_ARRIVES =
  "Emails about your account and security still arrive.";

export const UNSUBSCRIBE_CONFIRMATION: Record<UnsubscribeCategory, string> = {
  tips: `You will not get tips emails from us any more. ${ACCOUNT_MAIL_STILL_ARRIVES}`,
  offers: `You will not get trial or offer emails from us any more. ${ACCOUNT_MAIL_STILL_ARRIVES}`,
  updates: `You will not get update emails from us any more. ${ACCOUNT_MAIL_STILL_ARRIVES}`,
  recap: "The monthly recap is off.",
  all: `You will not get any optional emails from us any more. ${ACCOUNT_MAIL_STILL_ARRIVES}`,
  product: `You will not get trial reminders or other product emails from us any more. ${ACCOUNT_MAIL_STILL_ARRIVES}`,
  digest:
    "The daily digest email is off. You can turn it back on in Settings, under Notifications.",
};

/** What the confirm page says before the button is pressed. */
export const UNSUBSCRIBE_PROMPT: Record<UnsubscribeCategory, string> = {
  tips: "This stops tips emails.",
  offers: "This stops trial and offer emails.",
  updates: "This stops update emails.",
  recap: "This stops the monthly recap.",
  all: "This stops every optional email.",
  product: "This stops trial reminders and other product emails.",
  digest: "This turns the daily digest off.",
};
