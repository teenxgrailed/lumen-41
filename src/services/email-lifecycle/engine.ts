import { newDate } from "@/lib/date-utils";
import { countsTowardsCap, isOptionalCategory } from "@/lib/email/categories";
import { EmailService } from "@/lib/email/email-service";
import {
  isCategoryEnabled,
  switchOffAllOptional,
} from "@/lib/email/preferences";
import {
  type EmailProgramSettings,
  getEmailProgramSettings,
} from "@/lib/email/program-settings";
import {
  type LifecycleBase,
  getGiftTemplate,
  getOnboardDay2Template,
  getOnboardDay5Template,
  getOnboardDay9Template,
  getRecapTemplate,
  getStillWantTemplate,
  getTrialEnding0dTemplate,
  getTrialEnding3dTemplate,
  getWinback14Template,
  getWinback30Template,
} from "@/lib/email/templates/lifecycle";
import { signUnsubscribeToken, unsubscribeUrl } from "@/lib/email/unsubscribe";
import { SUPPORT_EMAIL } from "@/lib/legal/operator";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { candidateIds } from "./candidates";
import { byPriority, decide } from "./decide";
import { loadPeople } from "./people";
import { GIFT_RULE, OPTIONAL_RULE_KEYS, RULES } from "./rules";
import type { ExistingSend, Person, Rule, RuleContext, RuleKey } from "./types";
import { safeTimeZone } from "./zone";

const LOG_SOURCE = "EmailLifecycle";
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** A claim with no result after this long is treated as a crash. */
export const CLAIM_TTL_MINUTES = 15;
export const MAX_ATTEMPTS = 3;
export const RETRY_AFTER_HOURS = 1;
const BATCH = 200;

export type SweepSummary = {
  evaluated: number;
  sent: number;
  dry: number;
  deferred: number;
  failed: number;
  skipped: Record<string, number>;
};

type LedgerRow = {
  id: string;
  userId: string | null;
  ruleKey: string;
  dedupeKey: string;
  status: string;
  deferUntil: Date | null;
  attempts: number;
  claimedAt: Date | null;
  updatedAt: Date;
};

const plus = (date: Date, ms: number) => newDate(date.getTime() + ms);

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

export function dryRunFromEnv(): boolean {
  return process.env.EMAIL_PROGRAM_DRY_RUN === "1";
}

/**
 * What `decide` should see for an existing ledger row: a fresh claim and a
 * sent or skipped row end the rule; a failure waits an hour and stops after
 * three tries; a stale claim is a crash and is retried.
 */
export function existingFor(row: LedgerRow | undefined, now: Date): ExistingSend {
  if (!row) return null;
  if (row.status === "claimed") {
    const stale =
      !row.claimedAt || row.claimedAt < plus(now, -CLAIM_TTL_MINUTES * MINUTE_MS);
    return stale ? { status: "retry", deferUntil: null } : row;
  }
  if (row.status === "failed") {
    if (row.attempts >= MAX_ATTEMPTS) {
      return { status: "skipped", deferUntil: null };
    }
    const retryAt = plus(row.updatedAt, RETRY_AFTER_HOURS * HOUR_MS);
    return retryAt > now
      ? { status: "deferred", deferUntil: retryAt }
      : { status: "retry", deferUntil: null };
  }
  return { status: row.status, deferUntil: row.deferUntil };
}

const ledgerKey = (userId: string, ruleKey: string, dedupe: string) =>
  `${userId}|${ruleKey}|${dedupe}`;

function firstName(person: Person): string | null {
  const name = person.name?.trim();
  return name ? name.split(/\s+/)[0] : null;
}

function monthName(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

/** Last month's two numbers and the month before, for the recap. */
async function recapNumbers(userId: string, now: Date) {
  const thisMonth = newDate(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  const lastMonth = newDate(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
  );
  const before = newDate(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)
  );
  const [tasks, previous, habits] = await Promise.all([
    prisma.task.count({
      where: {
        userId,
        isSample: false,
        completedAt: { gte: lastMonth, lt: thisMonth },
      },
    }),
    prisma.task.count({
      where: {
        userId,
        isSample: false,
        completedAt: { gte: before, lt: lastMonth },
      },
    }),
    prisma.habitCompletion.count({
      where: {
        habit: { userId },
        date: { gte: lastMonth, lt: thisMonth },
      },
    }),
  ]);
  return {
    monthLabel: monthName(lastMonth),
    tasksCompleted: tasks > 0 ? tasks : null,
    habitCheckIns: habits > 0 ? habits : null,
    previousTasksCompleted: previous > 0 ? previous : null,
  };
}

/** The mail for one rule and person. Throws if a piece is missing. */
export async function renderForRule(
  ruleKey: Exclude<RuleKey, "gift">,
  person: Person,
  settings: EmailProgramSettings,
  now: Date
) {
  if (!settings.footer) throw new Error("The operator footer is not set");
  const category = RULES[ruleKey].category;
  if (!isOptionalCategory(category)) throw new Error("Not an optional rule");
  const base: LifecycleBase = {
    name: firstName(person),
    appUrl: appUrl(),
    unsubscribeUrl: unsubscribeUrl(person.userId, category),
    footer: settings.footer,
  };
  switch (ruleKey) {
    case "onboard-day2":
      return getOnboardDay2Template(base);
    case "onboard-day5":
      return getOnboardDay5Template(base);
    case "onboard-day9":
      return getOnboardDay9Template(base);
    case "trial-ending-3d":
      if (!person.trial) throw new Error("No trial");
      return getTrialEnding3dTemplate({ ...base, endsAt: person.trial.endsAt });
    case "trial-ending-0d":
      return getTrialEnding0dTemplate({ ...base, promoCode: settings.promoCode });
    case "winback-14d":
      return getWinback14Template(base);
    case "winback-30d":
      return getWinback30Template(base);
    case "still-want":
      return getStillWantTemplate({
        ...base,
        keepUrl: `${appUrl()}/email/preferences?t=${encodeURIComponent(
          signUnsubscribeToken(person.userId, "all")
        )}&keep=1`,
      });
    case "recap-monthly":
      return getRecapTemplate({
        ...base,
        ...(await recapNumbers(person.userId, now)),
      });
  }
}

async function writeLedger(input: {
  person: Person;
  rule: Rule;
  dedupe: string;
  status: "skipped" | "deferred" | "dry";
  reason: string;
  deferUntil?: Date;
  existing?: LedgerRow;
}) {
  const { person, rule, dedupe, status, reason } = input;
  if (input.existing && input.existing.status === "sent") return;
  await prisma.emailSend.upsert({
    where: {
      userId_ruleKey_dedupeKey: {
        userId: person.userId,
        ruleKey: rule.key,
        dedupeKey: dedupe,
      },
    },
    create: {
      userId: person.userId,
      ruleKey: rule.key,
      dedupeKey: dedupe,
      category: rule.category,
      status,
      reason,
      deferUntil: input.deferUntil ?? null,
    },
    update: { status, reason, deferUntil: input.deferUntil ?? null },
  });
}

/**
 * Takes the unique (person, rule, key) slot before anything is sent, so two
 * workers cannot both send. Null means someone else holds it.
 */
async function claim(
  person: Person,
  rule: Rule,
  dedupe: string,
  existing: LedgerRow | undefined,
  now: Date
): Promise<string | null> {
  if (existing) {
    const taken = await prisma.emailSend.updateMany({
      where: {
        id: existing.id,
        updatedAt: existing.updatedAt,
        status: { in: ["deferred", "dry", "failed", "claimed", "skipped"] },
      },
      data: {
        status: "claimed",
        claimedAt: now,
        attempts: { increment: 1 },
        reason: null,
      },
    });
    return taken.count === 1 ? existing.id : null;
  }
  try {
    const created = await prisma.emailSend.create({
      data: {
        userId: person.userId,
        ruleKey: rule.key,
        dedupeKey: dedupe,
        category: rule.category,
        status: "claimed",
        claimedAt: now,
        attempts: 1,
      },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    if ((error as { code?: unknown }).code === "P2002") return null;
    throw error;
  }
}

async function finishSend(
  id: string,
  data: {
    status: "sent" | "failed" | "skipped" | "cancelled";
    reason?: string;
    resendId?: string;
    sentAt?: Date;
  }
) {
  await prisma.emailSend.update({ where: { id }, data });
}

/** Sends one claimed optional mail. Returns true when it went out. */
async function sendOptional(
  person: Person,
  ruleKey: Exclude<RuleKey, "gift">,
  rule: Rule,
  id: string,
  settings: EmailProgramSettings,
  now: Date
): Promise<boolean> {
  const category = rule.category;
  /* The person may have switched the category off since the sweep began: a
     claimed mail is cancelled, not sent. */
  if (!isOptionalCategory(category) || !(await isCategoryEnabled(person.userId, category))) {
    await finishSend(id, { status: "cancelled", reason: "category-off" });
    return false;
  }
  try {
    const template = await renderForRule(ruleKey, person, settings, now);
    const result = await EmailService.sendEmail({
      to: person.email as string,
      subject: template.subject,
      html: template.html,
      text: template.text,
      commercial: true,
      programme: true,
      unsubscribeUrl: unsubscribeUrl(person.userId, category),
      replyTo: SUPPORT_EMAIL,
    });
    if (!result.jobId) {
      await finishSend(id, { status: "skipped", reason: "dropped" });
      return false;
    }
    await finishSend(id, {
      status: "sent",
      sentAt: newDate(),
      resendId: result.jobId,
    });
    return true;
  } catch (error) {
    await finishSend(id, {
      status: "failed",
      reason: error instanceof Error ? error.name : "error",
    });
    await logger.warn(
      "Lifecycle email failed",
      { rule: rule.key, error: error instanceof Error ? error.message : "Unknown" },
      LOG_SOURCE
    );
    return false;
  }
}

function emptySummary(): SweepSummary {
  return { evaluated: 0, sent: 0, dry: 0, deferred: 0, failed: 0, skipped: {} };
}

function countSkip(summary: SweepSummary, reason: string) {
  summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1;
}

/**
 * One pass of the engine: find who each rule could be due for, decide for
 * each, and send, skip or defer, writing every decision to the ledger. With
 * `dryRun`, Resend is never called and rows are written as `dry`.
 */
export async function runEmailSweep(
  options: { now?: Date; dryRun?: boolean } = {}
): Promise<SweepSummary> {
  const now = options.now ?? newDate();
  const dryRun = options.dryRun ?? dryRunFromEnv();
  const summary = emptySummary();
  const settings = await getEmailProgramSettings();
  if (!settings.footer) {
    await logger.warn(
      "Optional email is paused: set the footer name and address in System Settings",
      { missing: settings.footerMissing.join(",") },
      LOG_SOURCE
    );
  }

  const wanted = new Map<string, RuleKey[]>();
  for (const key of OPTIONAL_RULE_KEYS) {
    for (const id of await candidateIds(key, now)) {
      wanted.set(id, [...(wanted.get(id) ?? []), key]);
    }
  }
  const ids = [...wanted.keys()];
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const needsRecap = chunk.some((id) =>
      wanted.get(id)?.includes("recap-monthly")
    );
    const people = await loadPeople(chunk, now, { withRecapStats: needsRecap });
    const rows = await prisma.emailSend.findMany({
      where: { userId: { in: chunk }, ruleKey: { in: [...OPTIONAL_RULE_KEYS] } },
      select: {
        id: true,
        userId: true,
        ruleKey: true,
        dedupeKey: true,
        status: true,
        deferUntil: true,
        attempts: true,
        claimedAt: true,
        updatedAt: true,
      },
    });
    const ledger = new Map<string, LedgerRow>();
    for (const row of rows) {
      if (row.userId) {
        ledger.set(ledgerKey(row.userId, row.ruleKey, row.dedupeKey), row);
      }
    }

    for (const id of chunk) {
      const person = people.get(id);
      if (!person) continue;
      if (safeTimeZone(person.timeZone).invalid) {
        await logger.warn(
          "Invalid time zone, using UTC",
          { userId: person.userId },
          LOG_SOURCE
        );
      }
      const rules = (wanted.get(id) ?? [])
  .map((key) => RULES[key as Exclude<RuleKey, "gift">])
        .sort(byPriority);
      for (const rule of rules) {
        summary.evaluated += 1;
        const dedupe = rule.dedupeKey(person, {}, now);
        const row = ledger.get(ledgerKey(person.userId, rule.key, dedupe));
        const decision = decide({
          rule,
          person,
          now,
          footerResolved: Boolean(settings.footer),
          existing: existingFor(row, now),
        });
        if (decision.kind === "wait") continue;
        if (decision.kind === "skip") {
          countSkip(summary, decision.reason);
          if (decision.record) {
            await writeLedger({
              person,
              rule,
              dedupe,
              status: dryRun ? "dry" : "skipped",
              reason: decision.reason,
              existing: row,
            });
          }
          continue;
        }
        if (decision.kind === "defer") {
          summary.deferred += 1;
          await writeLedger({
            person,
            rule,
            dedupe,
            status: dryRun ? "dry" : "deferred",
            reason: dryRun ? `defer-${decision.reason}` : decision.reason,
            deferUntil: decision.until,
            existing: row,
          });
          continue;
        }
        // send
        if (dryRun) {
          summary.dry += 1;
          await writeLedger({
            person,
            rule,
            dedupe,
            status: "dry",
            reason: "would-send",
            existing: row,
          });
          if (countsTowardsCap(rule.category)) person.lastMarketingSentAt = now;
          continue;
        }
        const claimed = await claim(person, rule, dedupe, row, now);
        if (!claimed) continue;
        const ok = await sendOptional(
          person,
          rule.key as Exclude<RuleKey, "gift">,
          rule,
          claimed,
          settings,
          now
        );
        if (ok) {
          summary.sent += 1;
          person.lastMarketingSentAt = now;
        } else {
          summary.failed += 1;
        }
      }
    }
  }
  await logger.info("Email sweep finished", { ...summary }, LOG_SOURCE);
  return summary;
}

/**
 * Gift notices (transactional): for each gift that started in the last three
 * days and has no terminal ledger row, decide and send when the civil-hours
 * window allows. Sent whatever the person's optional categories say.
 */
export async function processGiftEmails(
  options: { now?: Date; dryRun?: boolean } = {}
): Promise<number> {
  const now = options.now ?? newDate();
  const dryRun = options.dryRun ?? dryRunFromEnv();
  const gifts = await prisma.proGift.findMany({
    where: { startsAt: { lte: now, gte: plus(now, -3 * DAY_MS) } },
    select: {
      id: true,
      userId: true,
      months: true,
      personalNote: true,
      startsAt: true,
      endsAt: true,
      revokedAt: true,
    },
    take: 200,
  });
  if (gifts.length === 0) return 0;
  const people = await loadPeople(
    [...new Set(gifts.map((gift) => gift.userId))],
    now
  );
  const settings = await getEmailProgramSettings();
  let sent = 0;
  for (const gift of gifts) {
    const person = people.get(gift.userId);
    if (!person) continue;
    const ctx: RuleContext = {
      gift: {
        id: gift.id,
        startsAt: gift.startsAt,
        endsAt: gift.endsAt,
        revoked: Boolean(gift.revokedAt),
      },
    };
    const row = await prisma.emailSend.findUnique({
      where: {
        userId_ruleKey_dedupeKey: {
          userId: gift.userId,
          ruleKey: "gift",
          dedupeKey: gift.id,
        },
      },
    });
    const decision = decide({
      rule: GIFT_RULE,
      person,
      now,
      ctx,
      footerResolved: true,
      existing: existingFor(row ?? undefined, now),
    });
    if (decision.kind === "wait" || decision.kind === "defer") {
      continue;
    }
    if (decision.kind === "skip") {
      if (decision.record) {
        await writeLedger({
          person,
          rule: GIFT_RULE,
          dedupe: gift.id,
          status: dryRun ? "dry" : "skipped",
          reason: decision.reason,
          existing: row ?? undefined,
        });
      }
      continue;
    }
    if (dryRun) {
      await writeLedger({
        person,
        rule: GIFT_RULE,
        dedupe: gift.id,
        status: "dry",
        reason: "would-send",
        existing: row ?? undefined,
      });
      continue;
    }
    const id = await claim(person, GIFT_RULE, gift.id, row ?? undefined, now);
    if (!id) continue;
    try {
      const template = getGiftTemplate({
        name: firstName(person),
        appUrl: appUrl(),
        months: gift.months,
        endsAt: gift.endsAt,
        personalNote: gift.personalNote,
        footer: settings.footer,
      });
      const result = await EmailService.sendEmail({
        to: person.email as string,
        subject: template.subject,
        html: template.html,
        text: template.text,
        replyTo: SUPPORT_EMAIL,
      });
      if (!result.jobId) {
        await finishSend(id, { status: "skipped", reason: "dropped" });
        continue;
      }
      await finishSend(id, {
        status: "sent",
        sentAt: newDate(),
        resendId: result.jobId,
      });
      sent += 1;
    } catch (error) {
      await finishSend(id, {
        status: "failed",
        reason: error instanceof Error ? error.name : "error",
      });
    }
  }
  return sent;
}

/**
 * The quarterly check has a fortnight to be answered. A person who did not
 * press keep and did not come back has every optional category switched off,
 * with source `sunset`. Account mail is untouched.
 */
export async function applySunset(now = newDate()): Promise<number> {
  const rows = await prisma.emailSend.findMany({
    where: {
      ruleKey: "still-want",
      status: "sent",
      keptAt: null,
      reason: null,
      sentAt: { lt: plus(now, -14 * DAY_MS) },
    },
    select: {
      id: true,
      userId: true,
      sentAt: true,
      user: { select: { lastActiveAt: true } },
    },
    take: 200,
  });
  let applied = 0;
  for (const row of rows) {
    if (!row.userId) continue;
    const returned =
      row.user?.lastActiveAt && row.sentAt && row.user.lastActiveAt > row.sentAt;
    if (returned) {
      await prisma.emailSend.update({
        where: { id: row.id },
        data: { reason: "returned" },
      });
      continue;
    }
    await switchOffAllOptional(row.userId, "sunset");
    await prisma.emailSend.update({
      where: { id: row.id },
      data: { reason: "sunset-applied" },
    });
    applied += 1;
  }
  return applied;
}

/** Marks the latest quarterly check as answered. */
export async function recordKeep(userId: string, now = newDate()) {
  await prisma.emailSend.updateMany({
    where: { userId, ruleKey: "still-want", status: "sent", keptAt: null },
    data: { keptAt: now },
  });
}
