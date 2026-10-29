import { SubscriptionPlan } from "@prisma/client";

import { addCalendarDays, addMinutes, newDate } from "@/lib/date-utils";
import { EmailService } from "@/lib/email/email-service";
import { getTrialEmailTemplate } from "@/lib/email/templates/trial";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import { effectiveSubscriptionPlan } from "@/lib/entitlements";
import { operatorPostalAddress } from "@/lib/legal/operator";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

type Milestone = "day11" | "day14";

const LOG_SOURCE = "TrialLifecycle";

const CLAIM_TTL_MINUTES = 15;

function payUrl(): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000";
  const url = new URL("/settings", baseUrl);
  url.hash = "billing";
  return url.toString();
}

async function processMilestone(milestone: Milestone, now: Date) {
  const sentField = milestone === "day11" ? "day11SentAt" : "day14SentAt";
  const claimedField =
    milestone === "day11" ? "day11ClaimedAt" : "day14ClaimedAt";
  const staleClaim = addMinutes(now, -CLAIM_TTL_MINUTES);
  let sent = 0;
  while (true) {
    const grants = await prisma.trialGrant.findMany({
      where: {
        userId: { not: null },
        [sentField]: null,
        ...(milestone === "day11"
          ? {
              startedAt: { lte: addCalendarDays(now, -11) },
              endsAt: { gt: now },
            }
          : { endsAt: { lte: now } }),
        OR: [{ [claimedField]: null }, { [claimedField]: { lt: staleClaim } }],
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            emailVerified: true,
            commercialEmailsOptOutAt: true,
            notificationSettings: { select: { emailNotifications: true } },
            subscription: {
              select: { plan: true, status: true, currentPeriodEnd: true },
            },
          },
        },
      },
      take: 100,
      orderBy: milestone === "day11" ? { startedAt: "asc" } : { endsAt: "asc" },
    });

    for (const grant of grants) {
      /* The trial mails sell Pro, so they follow the person's choices: the
         one-click unsubscribe, and the email switch in Settings, Notifications
         (a missing settings row is the default, on). */
      if (
        !grant.user?.email ||
        !grant.user.emailVerified ||
        grant.user.commercialEmailsOptOutAt ||
        grant.user.notificationSettings?.emailNotifications === false
      ) {
        await prisma.trialGrant.update({
          where: { id: grant.id },
          data: { [sentField]: now },
        });
        continue;
      }
      if (
        effectiveSubscriptionPlan(grant.user.subscription, null, now) !==
        SubscriptionPlan.FREE
      ) {
        await prisma.trialGrant.update({
          where: { id: grant.id },
          data: { [sentField]: now },
        });
        continue;
      }
      const claim = await prisma.trialGrant.updateMany({
        where: {
          id: grant.id,
          [sentField]: null,
          OR: [
            { [claimedField]: null },
            { [claimedField]: { lt: staleClaim } },
          ],
        },
        data: { [claimedField]: now },
      });
      if (claim.count !== 1) continue;

      const unsubscribe = unsubscribeUrl(grant.user.id, "product");
      const template = getTrialEmailTemplate({
        milestone,
        payUrl: payUrl(),
        unsubscribeUrl: unsubscribe,
      });
      await EmailService.sendEmail({
        to: grant.user.email,
        ...template,
        commercial: true,
        unsubscribeUrl: unsubscribe,
      });
      await prisma.trialGrant.update({
        where: { id: grant.id },
        data: { [sentField]: now },
      });
      sent += 1;
    }

    if (grants.length < 100) break;
  }
  return sent;
}

export async function processTrialLifecycle(now = newDate()) {
  /* Commercial mail carries the operator's postal address. Until it is set
     nothing is claimed or marked sent, so the mails go out once it is. */
  if (!operatorPostalAddress()) {
    logger.warn(
      "Trial emails paused: OPERATOR_POSTAL_ADDRESS is not set",
      {},
      LOG_SOURCE
    );
    return { day11: 0, day14: 0 };
  }
  const day14 = await processMilestone("day14", now);
  const day11 = await processMilestone("day11", now);
  return { day11, day14 };
}
