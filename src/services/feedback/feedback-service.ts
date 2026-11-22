import { Prisma } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import {
  ACTIVITY_WINDOW_DAYS,
  type FeedbackKind,
  type FeedbackPlatform,
  nextFeedbackPrompt,
} from "./eligibility";

/**
 * TaskActivity actions the sync and the importer write with the person as
 * actor while they are not using the app. They never count as use.
 */
export const SYNC_ACTIVITY_ACTIONS = ["IMPORTED", "ARCHIVED_BY_SYNC"] as const;

/** UTC midnight 13 days before `now`: the window is today and the 13 days before. */
export function activityWindowStart(now: Date): Date {
  return newDate(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - (ACTIVITY_WINDOW_DAYS - 1)
    )
  );
}

/**
 * Distinct UTC days in the last 14 on which the person did something in the
 * app: changed a task themselves, edited a page, tracked time, or hit an
 * activation milestone. Sync and import rows do not count. There is no
 * per-day "opened the app" record (`User.lastActiveAt` keeps only the latest
 * hour), so this counts real work, which is what "active" means here.
 * The columns are timestamps without a zone holding UTC, so `::date` is the
 * UTC day whatever the session TimeZone is.
 */
export async function countActiveDays(
  userId: string,
  now: Date = newDate()
): Promise<number> {
  const since = activityWindowStart(now);
  const rows = await prisma.$queryRaw<{ days: number }[]>(Prisma.sql`
    SELECT COUNT(DISTINCT d)::int AS days FROM (
      SELECT "createdAt"::date AS d FROM "TaskActivity"
        WHERE "actorId" = ${userId} AND "createdAt" >= ${since}
          AND "action" NOT IN (${Prisma.join([...SYNC_ACTIVITY_ACTIONS])})
      UNION ALL
      SELECT "createdAt"::date FROM "PageRevision"
        WHERE "userId" = ${userId} AND "createdAt" >= ${since}
      UNION ALL
      SELECT "startedAt"::date FROM "TimeEntry"
        WHERE "userId" = ${userId} AND "startedAt" >= ${since}
      UNION ALL
      SELECT "createdAt"::date FROM "ActivationEvent"
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
 * means: show nothing. Two tabs asking at once cannot both create a row: the
 * history is read again and the row written under a per-person advisory lock.
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

  const readHistory = (db: Pick<typeof prisma, "feedbackPrompt">) =>
    db.feedbackPrompt.findMany({
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
  const early = await readHistory(prisma);
  if (nextFeedbackPrompt(base, early, { activeDays: 99 }, now) === null)
    return null;
  const activeDays = await countActiveDays(userId, now);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    // Re-checked inside the lock: another tab may have created a row since.
    const history = await readHistory(tx);
    const kind = nextFeedbackPrompt(base, history, { activeDays }, now);
    if (!kind) return null;
    const row = await tx.feedbackPrompt.create({
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
  });
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

/** The headline numbers over the rows a filter matches, computed by the database. */
export async function summarizeFeedback(
  where: Prisma.FeedbackPromptWhereInput
): Promise<FeedbackSummary> {
  const withScore = (extra: Prisma.IntNullableFilter) => ({
    AND: [where, { score: extra }],
  });
  const [shown, answered, dismissed, ratings, scores, promoters, detractors] =
    await Promise.all([
      prisma.feedbackPrompt.count({ where }),
      prisma.feedbackPrompt.count({
        where: { AND: [where, { answeredAt: { not: null } }] },
      }),
      prisma.feedbackPrompt.count({
        where: { AND: [where, { dismissedAt: { not: null } }] },
      }),
      prisma.feedbackPrompt.aggregate({
        where: { AND: [where, { rating: { not: null } }] },
        _avg: { rating: true },
        _count: { rating: true },
      }),
      prisma.feedbackPrompt.aggregate({
        where: { AND: [where, { score: { not: null } }] },
        _avg: { score: true },
        _count: { score: true },
      }),
      prisma.feedbackPrompt.count({ where: withScore({ gte: 9 }) }),
      prisma.feedbackPrompt.count({ where: withScore({ lte: 6 }) }),
    ]);
  const npsCount = scores._count.score;
  return {
    shown,
    answered,
    dismissed,
    avgRating:
      ratings._avg.rating === null ? null : round1(ratings._avg.rating),
    ratingCount: ratings._count.rating,
    avgScore: scores._avg.score === null ? null : round1(scores._avg.score),
    nps: npsCount
      ? Math.round(((promoters - detractors) / npsCount) * 100)
      : null,
    npsCount,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
