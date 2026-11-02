import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

import { addCalendarDays, newDate } from "@/lib/date-utils";
import { EmailService } from "@/lib/email/email-service";
import {
  getStudentPriceEndingTemplate,
  getStudentRecheckTemplate,
} from "@/lib/email/templates/student";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { signStudentToken } from "@/lib/students/token";

const LOG_SOURCE = "StudentRecheck";

/**
 * The yearly student check (docs/students.md). Runs hourly from the worker;
 * every step is claimed in the database before its mail goes out, so a rerun,
 * a second worker or a crash between steps never mails twice.
 *
 * 1. Eleven months after the last proof, while a Pro subscription renews,
 *    the address the price rests on gets a one-click confirm link.
 * 2. Confirming (api/students/confirm) renews the proof and clears step 1.
 * 3. Not confirmed after 14 days, and the next renewal 12 to 14 days away:
 *    the price lapses, the person is told 14 days ahead, and the
 *    subscription goes on support's list (Creem's API cannot remove a
 *    discount from a running subscription; `removeStudentDiscountAtRenewal`).
 *    A renewal that is nearer than 12 days waits for the next period, so the
 *    notice is never short.
 */
export const RECHECK_AFTER_DAYS = 335;
export const RECHECK_GRACE_DAYS = 14;
export const NOTICE_DAYS = 14;
/** The notice goes out between 12 and 14 days before the renewal. */
export const NOTICE_WINDOW_MIN_DAYS = 12;

const BATCH = 100;

function appUrl(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000";
  return new URL(path, base).toString();
}

/** A Pro subscription that will charge again. */
const renewingPro = {
  plan: SubscriptionPlan.PRO,
  status: SubscriptionStatus.ACTIVE,
  cancelAtPeriodEnd: false,
  currentPeriodEnd: { not: null },
} as const;

async function sendRechecks(now: Date): Promise<number> {
  let sent = 0;
  const due = await prisma.user.findMany({
    where: {
      studentEmail: { not: null },
      studentLapsedAt: null,
      studentRecheckSentAt: null,
      studentVerifiedAt: { lte: addCalendarDays(now, -RECHECK_AFTER_DAYS) },
      subscription: renewingPro,
    },
    select: {
      id: true,
      studentEmail: true,
      subscription: { select: { currentPeriodEnd: true } },
    },
    take: BATCH,
    orderBy: { studentVerifiedAt: "asc" },
  });
  for (const user of due) {
    const email = user.studentEmail!;
    const claimed = await prisma.user.updateMany({
      where: { id: user.id, studentRecheckSentAt: null, studentEmail: email },
      data: { studentRecheckSentAt: now },
    });
    if (claimed.count === 0) continue;
    const token = signStudentToken(
      { userId: user.id, email, purpose: "recheck" },
      now.getTime()
    );
    const url = new URL(appUrl("/api/students/confirm"));
    url.searchParams.set("t", token);
    try {
      await EmailService.sendEmail({
        to: email,
        ...getStudentRecheckTemplate({
          confirmUrl: url.toString(),
          renewsAt: user.subscription?.currentPeriodEnd ?? null,
        }),
      });
      sent += 1;
    } catch (error) {
      // Not sent: release the claim so the next run tries again.
      await prisma.user.updateMany({
        where: { id: user.id, studentRecheckSentAt: now },
        data: { studentRecheckSentAt: null },
      });
      logger.error(
        "Could not send the student re-check",
        {
          userId: user.id,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
    }
  }
  return sent;
}

/**
 * What the billing service can do about a lapsed student's renewal. Creem's
 * subscription update takes items and a proration mode only, no discount
 * (checked against the API reference and SDK 1.5.4, 2026-10-29), so this
 * records the to-do for support instead of calling Creem. When Creem adds a
 * way, this is the one place to call it.
 */
export async function removeStudentDiscountAtRenewal(input: {
  userId: string;
  creemSubscriptionId: string | null;
  renewsAt: Date;
}): Promise<{ applied: false; reason: "creem_api_unsupported" }> {
  await prisma.adminAuditLog.create({
    data: {
      actorId: null,
      targetUserId: input.userId,
      action: "student.discount_removal_required",
      details: {
        creemSubscriptionId: input.creemSubscriptionId,
        renewsAt: input.renewsAt.toISOString(),
      },
    },
  });
  logger.warn(
    "Student re-check failed: discount must be removed in Creem by hand",
    { userId: input.userId, renewsAt: input.renewsAt.toISOString() },
    LOG_SOURCE
  );
  return { applied: false, reason: "creem_api_unsupported" };
}

async function lapseUnconfirmed(now: Date): Promise<number> {
  let lapsed = 0;
  const due = await prisma.user.findMany({
    where: {
      studentEmail: { not: null },
      studentLapsedAt: null,
      studentRecheckSentAt: {
        lte: addCalendarDays(now, -RECHECK_GRACE_DAYS),
      },
      subscription: {
        ...renewingPro,
        currentPeriodEnd: {
          gt: addCalendarDays(now, NOTICE_WINDOW_MIN_DAYS),
          lte: addCalendarDays(now, NOTICE_DAYS),
        },
      },
    },
    select: {
      id: true,
      email: true,
      studentEmail: true,
      subscription: {
        select: {
          currentPeriodEnd: true,
          interval: true,
          creemSubscriptionId: true,
        },
      },
    },
    take: BATCH,
  });
  for (const user of due) {
    const renewsAt = user.subscription?.currentPeriodEnd;
    if (!renewsAt) continue;
    const claimed = await prisma.user.updateMany({
      where: { id: user.id, studentLapsedAt: null },
      data: { studentLapsedAt: now },
    });
    if (claimed.count === 0) continue;
    // The notice goes to the sign-in address: the university one is the
    // address that stopped answering. No notice, no lapse: the price only
    // ends after the person has been told.
    const to = user.email ?? user.studentEmail!;
    try {
      await EmailService.sendEmail({
        to,
        ...getStudentPriceEndingTemplate({
          renewsAt,
          interval: user.subscription?.interval === "year" ? "year" : "month",
          settingsUrl: appUrl("/settings?section=billing"),
        }),
      });
    } catch (error) {
      await prisma.user.updateMany({
        where: { id: user.id, studentLapsedAt: now },
        data: { studentLapsedAt: null },
      });
      logger.error(
        "Could not send the student price notice",
        {
          userId: user.id,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
      continue;
    }
    await removeStudentDiscountAtRenewal({
      userId: user.id,
      creemSubscriptionId: user.subscription?.creemSubscriptionId ?? null,
      renewsAt,
    });
    lapsed += 1;
  }
  return lapsed;
}

export async function processStudentRechecks(now: Date = newDate()) {
  const rechecks = await sendRechecks(now);
  const lapsed = await lapseUnconfirmed(now);
  if (rechecks || lapsed) {
    await logger.info(
      "Student re-check sweep",
      { rechecks, lapsed },
      LOG_SOURCE
    );
  }
  return { rechecks, lapsed };
}
