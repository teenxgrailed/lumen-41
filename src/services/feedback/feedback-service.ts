import { Prisma } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import {
  ACTIVITY_WINDOW_DAYS,
  type FeedbackKind,
  type FeedbackPlatform,
  nextFeedbackPrompt,
} from "./eligibility";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Distinct UTC days in the last 14 on which the person did something in the
 * app: changed a task, edited a page, tracked time, or hit an activation
 * milestone. There is no per-day "opened the app" record (`User.lastActiveAt`
 * keeps only the latest hour), so this counts real work, which is what
 * "active" means here.
 */
export async function countActiveDays(
  userId: string,
  now: Date = newDate()
): Promise<number> {
  const since = newDate(now.getTime() - ACTIVITY_WINDOW_DAYS * DAY_MS);
  const rows = await prisma.$queryRaw<{ days: number }[]>(Prisma.sql`
    SELECT COUNT(DISTINCT d)::int AS days FROM (
      SELECT ("createdAt" AT TIME ZONE 'UTC')::date AS d FROM "TaskActivity"
        WHERE "actorId" = ${userId} AND "createdAt" >= ${since}
      UNION ALL
      SELECT ("createdAt" AT TIME ZONE 'UTC')::date FROM "PageRevision"
        WHERE "userId" = ${userId} AND "createdAt" >= ${since}
      UNION ALL
      SELECT ("startedAt" AT TIME ZONE 'UTC')::date FROM "TimeEntry"
        WHERE "userId" = ${userId} AND "startedAt" >= ${since}
      UNION ALL
      SELECT ("createdAt" AT TIME ZONE 'UTC')::date FROM "ActivationEvent"
        WHERE "userId" = ${userId} AND "createdAt" >= ${since}
    ) days_used`);
  return rows[0]?.days ?? 0;
}

export interface OfferedPrompt {
  id: string;
  kind: FeedbackKind;
}

/**
 * Decides whether this person is asked now and, if so, records that the
 * prompt was shown (the row's `shownAt` is what spaces the next one). Null
 * means: show nothing.
 */
export async function offerFeedbackPrompt(
  userId: string,
  context: { platform: FeedbackPlatform; appVersion: string | null },
  now: Date = newDate()
): Promise<OfferedPrompt | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      onboardingCompletedAt: true,
      sandboxKind: true,
      userSettings: { select: { feedbackPrompts: true } },
    },
  });
  // Sandbox logins (reviewers, the public demo) are never asked.
  if (!user || user.sandboxKind) return null;

  const history = await prisma.feedbackPrompt.findMany({
    where: { userId },
    select: { kind: true, shownAt: true },
    orderBy: { shownAt: "desc" },
    take: 20,
  });
  const base = {
    createdAt: user.createdAt,
    feedbackPrompts: user.userSettings?.feedbackPrompts ?? true,
    onboardingDone: user.onboardingCompletedAt !== null,
  };
  // The cheap rules first: the activity query only runs for someone who could
  // be asked at all.
  if (nextFeedbackPrompt(base, history, { activeDays: 99 }, now) === null)
    return null;
  const activeDays = await countActiveDays(userId, now);
  const kind = nextFeedbackPrompt(base, history, { activeDays }, now);
  if (!kind) return null;

  const row = await prisma.feedbackPrompt.create({
    data: {
      userId,
      kind,
      shownAt: now,
      platform: context.platform,
      appVersion: context.appVersion,
    },
    select: { id: true },
  });
  return { id: row.id, kind };
}

export interface FeedbackSummary {
  shown: number;
  answered: number;
  dismissed: number;
  /** Mean of the 1-5 ratings; null with none. */
  avgRating: number | null;
  ratingCount: number;
  /** Mean of the 0-10 scores; null with none. */
  avgScore: number | null;
  /** Net Promoter Score: % of 9-10 minus % of 0-6, from -100 to 100. */
  nps: number | null;
  npsCount: number;
}

interface SummaryRow {
  answeredAt: Date | null;
  dismissedAt: Date | null;
  rating: number | null;
  score: number | null;
}

/** The headline numbers over the rows the admin filter matched. */
export function summarizeFeedback(
  rows: readonly SummaryRow[]
): FeedbackSummary {
  let answered = 0;
  let dismissed = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  let scoreSum = 0;
  let npsCount = 0;
  let promoters = 0;
  let detractors = 0;
  for (const row of rows) {
    if (row.answeredAt) answered += 1;
    if (row.dismissedAt) dismissed += 1;
    if (row.rating !== null) {
      ratingSum += row.rating;
      ratingCount += 1;
    }
    if (row.score !== null) {
      scoreSum += row.score;
      npsCount += 1;
      if (row.score >= 9) promoters += 1;
      else if (row.score <= 6) detractors += 1;
    }
  }
  return {
    shown: rows.length,
    answered,
    dismissed,
    avgRating: ratingCount ? round1(ratingSum / ratingCount) : null,
    ratingCount,
    avgScore: npsCount ? round1(scoreSum / npsCount) : null,
    nps: npsCount
      ? Math.round(((promoters - detractors) / npsCount) * 100)
      : null,
    npsCount,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
