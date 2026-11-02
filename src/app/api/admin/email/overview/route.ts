import { NextRequest, NextResponse } from "next/server";

import { dryRunFromEnv } from "@/services/email-lifecycle/engine";
import { EMAIL_PROGRAM_FLAG } from "@/services/email-lifecycle/people";
import { RULES } from "@/services/email-lifecycle/rules";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requireAdmin } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import {
  getEmailProgramSettings,
  trackingActive,
} from "@/lib/email/program-settings";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "AdminEmailOverviewAPI";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/admin/email/overview : the state of the email programme for the
 * admin page: what is missing from System Settings, the rules, and what the
 * engine did in the last 30 days (counts per rule and status, newest rows).
 */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const now = newDate();
    const since = newDate(now.getTime() - 30 * DAY_MS);
    const [settings, flag, grouped, recent] = await Promise.all([
      getEmailProgramSettings(),
      prisma.featureFlag.findUnique({
        where: { key: EMAIL_PROGRAM_FLAG },
        select: { enabled: true, rolloutPercentage: true },
      }),
      prisma.emailSend.groupBy({
        by: ["ruleKey", "status", "reason"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.emailSend.findMany({
        orderBy: { updatedAt: "desc" },
        take: 60,
        select: {
          id: true,
          ruleKey: true,
          status: true,
          reason: true,
          category: true,
          attempts: true,
          deferUntil: true,
          sentAt: true,
          opens: true,
          clicks: true,
          updatedAt: true,
        },
      }),
    ]);
    return NextResponse.json({
      settings: {
        footerSet: Boolean(settings.footer),
        footerMissing: settings.footerMissing,
        promoCodeSet: Boolean(settings.promoCode),
        trackingEndsAt: settings.trackingEndsAt,
        trackingActive: trackingActive(settings, now),
      },
      flag: flag
        ? { enabled: flag.enabled, rolloutPercentage: flag.rolloutPercentage }
        : { enabled: false, rolloutPercentage: 0 },
      dryRun: dryRunFromEnv(),
      rules: Object.values(RULES).map((rule) => ({
        key: rule.key,
        category: rule.category,
        priority: rule.priority,
      })),
      counts: grouped.map((row) => ({
        ruleKey: row.ruleKey,
        status: row.status,
        reason: row.reason,
        count: row._count._all,
      })),
      recent,
    });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Could not load the email overview",
      LOG_SOURCE,
      "The overview could not be loaded."
    );
  }
}
