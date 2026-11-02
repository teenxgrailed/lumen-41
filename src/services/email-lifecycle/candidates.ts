import type { Prisma } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { DAYS } from "./rules";
import type { RuleKey } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE = 500;
/** Per rule and sweep. Keeps one sweep bounded whatever the user base. */
const MAX_PER_RULE = 5000;

const ago = (now: Date, days: number) => newDate(now.getTime() - days * DAY_MS);
const ahead = (now: Date, days: number) =>
  newDate(now.getTime() + days * DAY_MS);

/** Rows that end a single-shot rule for a person. */
const TERMINAL_STATUSES = ["sent", "skipped", "cancelled"];

const base: Prisma.UserWhereInput = {
  email: { not: null },
  emailVerified: { not: null },
  sandboxKind: null,
};

function notDoneYet(rule: RuleKey): Prisma.UserWhereInput {
  return {
    emailSends: {
      none: { ruleKey: rule, status: { in: TERMINAL_STATUSES } },
    },
  };
}

/**
 * For rules that repeat per lapse: nobody with a terminal row of this rule
 * created in the last `days`. Without it the 5000 cap, ordered by id, fills
 * with people already handled and later ids are never evaluated. A row older
 * than the window belongs to an earlier lapse, so it does not exclude.
 */
function notDoneSince(
  rule: RuleKey,
  now: Date,
  days: number
): Prisma.UserWhereInput {
  return {
    emailSends: {
      none: {
        ruleKey: rule,
        status: { in: TERMINAL_STATUSES },
        createdAt: { gte: ago(now, days) },
      },
    },
  };
}

/**
 * The accounts a rule could be due for right now, found with a bounded query
 * on the trigger column. This only narrows the field: `decide` makes the real
 * call for each one. Gift mail is not found here (see gifts.ts).
 */
function whereFor(
  rule: Exclude<RuleKey, "gift">,
  now: Date
): Prisma.UserWhereInput | null {
  switch (rule) {
    case "onboard-day2":
    case "onboard-day5":
    case "onboard-day9": {
      const days = Number(rule.slice("onboard-day".length));
      return {
        ...base,
        ...notDoneYet(rule),
        emailVerified: {
          gt: ago(now, days + DAYS.onboardingGrace),
          lte: ago(now, days),
        },
      };
    }
    case "trial-ending-3d":
      return {
        ...base,
        ...notDoneYet(rule),
        trialGrant: { endsAt: { gt: now, lte: ahead(now, 3) } },
      };
    case "trial-ending-0d":
      return {
        ...base,
        ...notDoneYet(rule),
        trialGrant: { endsAt: { gt: now, lte: ahead(now, 1.5) } },
      };
    case "winback-14d":
      return {
        ...base,
        // A row for this lapse is written on or after day 14 of it.
        ...notDoneSince(rule, now, DAYS.winback14Until - 14),
        lastActiveAt: {
          gte: ago(now, DAYS.winback14Until),
          lte: ago(now, 14),
        },
      };
    case "winback-30d":
      return {
        ...base,
        ...notDoneSince(rule, now, DAYS.winback30Until - 30),
        lastActiveAt: {
          gte: ago(now, DAYS.winback30Until),
          lte: ago(now, 30),
        },
      };
    case "still-want":
      return {
        ...base,
        // One check per quarter: a row in the last quarter settles this one.
        ...notDoneSince(rule, now, DAYS.stillWantEvery),
        lastActiveAt: { not: null, lte: ago(now, DAYS.stillWantEvery) },
      };
    case "recap-monthly":
      // The first weekday is within the first five days; stay quiet otherwise.
      if (now.getUTCDate() > 9) return null;
      return {
        ...base,
        emailPreferences: { some: { category: "recap", enabled: true } },
      };
  }
}

export async function candidateIds(
  rule: Exclude<RuleKey, "gift">,
  now: Date
): Promise<string[]> {
  const where = whereFor(rule, now);
  if (!where) return [];
  const ids: string[] = [];
  let cursor: string | undefined;
  while (ids.length < MAX_PER_RULE) {
    const page = await prisma.user.findMany({
      where,
      select: { id: true },
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    ids.push(...page.map((row) => row.id));
    if (page.length < PAGE) break;
    cursor = page[page.length - 1].id;
  }
  return ids;
}
