import { NextRequest, NextResponse } from "next/server";

import { FEEDBACK_KINDS } from "@/services/feedback/eligibility";
import { summarizeFeedback } from "@/services/feedback/feedback-service";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requireAdmin } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "AdminFeedbackAPI";
const DAY_MS = 24 * 60 * 60 * 1000;
const LIST_MAX = 200;

/** "2026-11-22" as that UTC midnight, or null when it is not a real date. */
function parseDay(value: string | null): Date | null | "invalid" {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "invalid";
  const at = newDate(`${value}T00:00:00.000Z`);
  return Number.isNaN(at.getTime()) ? "invalid" : at;
}

/**
 * The feedback answers, newest first, with the averages over everything the
 * filter matches (not only the 200 rows listed). Filters: `kind` (rating,
 * idea, annoyance, nps), `from` and `to` (YYYY-MM-DD, both days included, UTC).
 */
export async function GET(request: NextRequest) {
  const authResponse = await requireAdmin(request);
  if (authResponse) return authResponse;
  try {
    const params = request.nextUrl.searchParams;
    const kind = params.get("kind");
    if (kind && !(FEEDBACK_KINDS as readonly string[]).includes(kind))
      return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
    const from = parseDay(params.get("from"));
    const to = parseDay(params.get("to"));
    if (from === "invalid" || to === "invalid")
      return NextResponse.json(
        { error: "Dates are YYYY-MM-DD" },
        { status: 400 }
      );

    const where = {
      ...(kind ? { kind } : {}),
      ...(from || to
        ? {
            shownAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lt: newDate(to.getTime() + DAY_MS) } : {}),
            },
          }
        : {}),
    };
    const [rows, summaryRows] = await Promise.all([
      prisma.feedbackPrompt.findMany({
        where,
        orderBy: { shownAt: "desc" },
        take: LIST_MAX,
        select: {
          id: true,
          kind: true,
          shownAt: true,
          answeredAt: true,
          dismissedAt: true,
          rating: true,
          score: true,
          text: true,
          platform: true,
          appVersion: true,
          user: { select: { email: true } },
        },
      }),
      prisma.feedbackPrompt.findMany({
        where,
        select: {
          answeredAt: true,
          dismissedAt: true,
          rating: true,
          score: true,
        },
      }),
    ]);
    return NextResponse.json({
      summary: summarizeFeedback(summaryRows),
      items: rows.map(({ user, ...row }) => ({
        ...row,
        email: user.email,
      })),
    });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to list feedback",
      LOG_SOURCE,
      "Could not load feedback."
    );
  }
}
