import { recordAdminAudit } from "@/services/admin/audit";
import {
  CLAIM_TTL_MINUTES,
  RETRY_AFTER_HOURS,
  dryRunFromEnv,
} from "@/services/email-lifecycle/engine";
import { loadPeople } from "@/services/email-lifecycle/people";

import { newDate } from "@/lib/date-utils";
import { EmailService } from "@/lib/email/email-service";
import { getEmailProgramSettings } from "@/lib/email/program-settings";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import { SUPPORT_EMAIL } from "@/lib/legal/operator";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import {
  BATCH_SIZE,
  BROADCAST_CAP_DAYS,
  type BroadcastCategory,
  DEFER_LIMIT_DAYS,
  REQUESTS_PER_SECOND,
  type Segment,
  decideBroadcastSend,
} from "./rules";
import {
  BROADCAST_RULE_KEY,
  broadcastDedupeKey,
  renderBroadcast,
  resolveRecipientIds,
} from "./service";

const LOG_SOURCE = "EmailBroadcasts";
const DAY_MS = 24 * 60 * 60 * 1000;
/** One worker tick works for at most this long, then the next tick resumes. */
const TICK_BUDGET_MS = 45_000;
const GAP_MS = Math.ceil(1000 / REQUESTS_PER_SECOND);
const MAX_ATTEMPTS = 3;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
/** A cancel must stop the send within about this many mails (~2 s at 5/s). */
const STILL_SENDING_EVERY = 10;

/**
 * Who a sending broadcast goes to, resolved once per worker process and kept
 * until the broadcast ends. Each person is still re-checked when their turn
 * comes (`decideBroadcastSend`), so a stale entry can only be skipped, never
 * mailed wrongly. A restart resolves again.
 */
const recipientSnapshots = new Map<string, string[]>();

async function recipientsOf(
  broadcastId: string,
  segment: Segment,
  category: BroadcastCategory,
  now: Date
): Promise<string[]> {
  const cached = recipientSnapshots.get(broadcastId);
  if (cached) return cached;
  const ids = await resolveRecipientIds(segment, category, now);
  recipientSnapshots.set(broadcastId, ids);
  return ids;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Starts every scheduled broadcast whose time has come. */
async function startDue(now: Date) {
  const due = await prisma.emailBroadcast.findMany({
    where: { status: "scheduled", scheduledAt: { lte: now } },
    select: { id: true },
  });
  for (const row of due) {
    // Conditional, so two workers cannot both start it.
    await prisma.emailBroadcast.updateMany({
      where: { id: row.id, status: "scheduled" },
      data: { status: "sending", startedAt: now },
    });
  }
}

async function isStillSending(id: string): Promise<boolean> {
  const row = await prisma.emailBroadcast.findUnique({
    where: { id },
    select: { status: true },
  });
  return row?.status === "sending";
}

/** Latest broadcast each person received before this one. */
async function lastBroadcasts(
  userIds: string[],
  excludeId: string,
  now: Date
): Promise<Map<string, Date>> {
  const rows = await prisma.emailSend.groupBy({
    by: ["userId"],
    where: {
      userId: { in: userIds },
      ruleKey: BROADCAST_RULE_KEY,
      status: "sent",
      dedupeKey: { not: broadcastDedupeKey(excludeId) },
      sentAt: { gte: newDate(now.getTime() - BROADCAST_CAP_DAYS * DAY_MS) },
    },
    _max: { sentAt: true },
  });
  const out = new Map<string, Date>();
  for (const row of rows) {
    if (row.userId && row._max.sentAt) out.set(row.userId, row._max.sentAt);
  }
  return out;
}

type Counts = {
  sent: number;
  skipped: number;
  pending: number;
  dry: number;
};

/**
 * One tick for one broadcast: send up to a few batches of 100 at no more than
 * 5 requests a second, resuming from the ledger so nobody gets it twice.
 */
async function work(
  broadcast: {
    id: string;
    category: string;
    segment: string;
    startedAt: Date | null;
    createdBy: string;
  },
  deadline: number,
  dryRun: boolean
): Promise<Counts> {
  const dedupe = broadcastDedupeKey(broadcast.id);
  const now = newDate();
  const startedAt = broadcast.startedAt ?? now;
  const settings = await getEmailProgramSettings();
  const full = await prisma.emailBroadcast.findUnique({
    where: { id: broadcast.id },
  });
  if (!full || !settings.footer) {
    // Without the footer nothing optional goes out; try again next tick.
    return { sent: 0, skipped: 0, pending: 1, dry: 0 };
  }
  const segment = broadcast.segment as Segment;
  const category = broadcast.category as BroadcastCategory;
  const ids = await recipientsOf(broadcast.id, segment, category, now);

  /* A claim with no result after the TTL is a crash between Resend and the
     ledger. Whether the mail left is unknown, so it is closed as skipped and
     never resent blindly. */
  await prisma.emailSend.updateMany({
    where: {
      ruleKey: BROADCAST_RULE_KEY,
      dedupeKey: dedupe,
      status: "claimed",
      OR: [
        { claimedAt: null },
        {
          claimedAt: {
            lt: newDate(now.getTime() - CLAIM_TTL_MINUTES * MINUTE_MS),
          },
        },
      ],
    },
    data: { status: "skipped", reason: "unknown-send" },
  });

  const settled = await prisma.emailSend.findMany({
    where: {
      ruleKey: BROADCAST_RULE_KEY,
      dedupeKey: dedupe,
      userId: { in: ids },
    },
    select: {
      userId: true,
      status: true,
      deferUntil: true,
      attempts: true,
      updatedAt: true,
    },
  });
  const done = new Set<string>();
  const waiting = new Map<string, Date>();
  for (const row of settled) {
    if (!row.userId) continue;
    if (row.status === "deferred" && row.deferUntil && row.deferUntil > now) {
      waiting.set(row.userId, row.deferUntil);
    } else if (row.status === "failed") {
      if (row.attempts >= MAX_ATTEMPTS) {
        done.add(row.userId);
      } else {
        // Back off like the lifecycle engine: retry no sooner than an hour on.
        const retryAt = newDate(
          row.updatedAt.getTime() + RETRY_AFTER_HOURS * HOUR_MS
        );
        if (retryAt > now) waiting.set(row.userId, retryAt);
      }
    } else if (row.status === "dry") {
      // A rehearsal row does not settle a real send.
      if (dryRun) done.add(row.userId);
    } else if (row.status !== "deferred") {
      done.add(row.userId);
    }
  }
  let todo = ids.filter((id) => !done.has(id) && !waiting.has(id));
  /* People the flag switched off mid-send get no row: they wait, and the
     broadcast stays `sending` so it resumes when the flag is back. */
  let flagWaiting = 0;
  const giveUpAt = startedAt.getTime() + DEFER_LIMIT_DAYS * DAY_MS;
  let stopped = false;

  while (todo.length > 0 && Date.now() < deadline && !stopped) {
    if (!(await isStillSending(broadcast.id))) break;
    const batch = todo.slice(0, BATCH_SIZE);
    todo = todo.slice(BATCH_SIZE);
    const people = await loadPeople(batch, now);
    const last = await lastBroadcasts(batch, broadcast.id, now);
    let processed = 0;
    for (const userId of batch) {
      if (Date.now() >= deadline) break;
      if (
        processed > 0 &&
        processed % STILL_SENDING_EVERY === 0 &&
        !(await isStillSending(broadcast.id))
      ) {
        stopped = true;
        break;
      }
      processed += 1;
      const person = people.get(userId);
      if (!person) continue;
      const decision = decideBroadcastSend({
        person,
        category,
        segment,
        now,
        startedAt,
        lastBroadcastAt: last.get(userId) ?? null,
      });
      const key = {
        userId_ruleKey_dedupeKey: {
          userId,
          ruleKey: BROADCAST_RULE_KEY,
          dedupeKey: dedupe,
        },
      };
      if (
        decision.kind === "skip" &&
        decision.reason === "flag-off" &&
        now.getTime() < giveUpAt
      ) {
        flagWaiting += 1;
        continue;
      }
      if (decision.kind === "skip") {
        await prisma.emailSend.upsert({
          where: key,
          create: {
            userId,
            ruleKey: BROADCAST_RULE_KEY,
            dedupeKey: dedupe,
            category,
            status: "skipped",
            reason: decision.reason,
            broadcastId: broadcast.id,
          },
          update: { status: "skipped", reason: decision.reason },
        });
        continue;
      }
      if (decision.kind === "defer") {
        await prisma.emailSend.upsert({
          where: key,
          create: {
            userId,
            ruleKey: BROADCAST_RULE_KEY,
            dedupeKey: dedupe,
            category,
            status: "deferred",
            reason: decision.reason,
            deferUntil: decision.until,
            broadcastId: broadcast.id,
          },
          update: {
            status: "deferred",
            reason: decision.reason,
            deferUntil: decision.until,
          },
        });
        continue;
      }
      if (dryRun) {
        // A rehearsal: write the row, never call Resend.
        await prisma.emailSend.upsert({
          where: key,
          create: {
            userId,
            ruleKey: BROADCAST_RULE_KEY,
            dedupeKey: dedupe,
            category,
            status: "dry",
            reason: "would-send",
            broadcastId: broadcast.id,
          },
          update: { status: "dry", reason: "would-send" },
        });
        continue;
      }
      // Claim first, send second: the unique slot is the exactly-once guard.
      let claimId: string | null = null;
      let attempt = 1;
      try {
        const existing = await prisma.emailSend.findUnique({ where: key });
        if (existing) {
          const taken = await prisma.emailSend.updateMany({
            where: {
              id: existing.id,
              updatedAt: existing.updatedAt,
              status: { in: ["deferred", "failed", "dry"] },
            },
            data: {
              status: "claimed",
              claimedAt: now,
              reason: null,
              attempts: { increment: 1 },
            },
          });
          claimId = taken.count === 1 ? existing.id : null;
          attempt = existing.attempts + 1;
        } else {
          const created = await prisma.emailSend.create({
            data: {
              userId,
              ruleKey: BROADCAST_RULE_KEY,
              dedupeKey: dedupe,
              category,
              status: "claimed",
              claimedAt: now,
              attempts: 1,
              broadcastId: broadcast.id,
            },
            select: { id: true },
          });
          claimId = created.id;
        }
      } catch (error) {
        if ((error as { code?: unknown }).code !== "P2002") throw error;
      }
      if (!claimId) continue;
      try {
        const link = unsubscribeUrl(
          userId,
          category === "offers" ? "offers" : "updates"
        );
        const rendered = renderBroadcast(full, settings.footer, link);
        const result = await EmailService.sendEmail({
          to: person.email as string,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          commercial: true,
          programme: true,
          unsubscribeUrl: link,
          replyTo: SUPPORT_EMAIL,
          idempotencyKey: `${claimId}:${attempt}`,
        });
        await prisma.emailSend.update({
          where: { id: claimId },
          data: result.jobId
            ? { status: "sent", sentAt: newDate(), resendId: result.jobId }
            : { status: "skipped", reason: "dropped" },
        });
      } catch (error) {
        await prisma.emailSend.update({
          where: { id: claimId },
          data: {
            status: "failed",
            reason: error instanceof Error ? error.name : "error",
          },
        });
        await logger.warn(
          "Broadcast send failed",
          { broadcastId: broadcast.id },
          LOG_SOURCE
        );
      }
      await sleep(GAP_MS);
    }
    // Anyone the deadline cut off goes back to the front for the next tick.
    if (processed < batch.length && !stopped)
      todo = [...batch.slice(processed), ...todo];
    if (Date.now() >= deadline) break;
  }

  // A person who left the segment while deferred, or failed three times, is
  // finished, so the broadcast can end.
  await prisma.emailSend.updateMany({
    where: {
      ruleKey: BROADCAST_RULE_KEY,
      dedupeKey: dedupe,
      status: "deferred",
      userId: { notIn: ids },
    },
    data: { status: "skipped", reason: "left-segment" },
  });
  await prisma.emailSend.updateMany({
    where: {
      ruleKey: BROADCAST_RULE_KEY,
      dedupeKey: dedupe,
      status: "failed",
      attempts: { gte: MAX_ATTEMPTS },
    },
    data: { status: "skipped", reason: "send-failed" },
  });

  const tallies = await prisma.emailSend.groupBy({
    by: ["status"],
    where: { ruleKey: BROADCAST_RULE_KEY, dedupeKey: dedupe },
    _count: { _all: true },
  });
  const counts: Counts = { sent: 0, skipped: 0, pending: 0, dry: 0 };
  for (const row of tallies) {
    const n = row._count._all;
    if (row.status === "sent") counts.sent += n;
    else if (row.status === "dry") {
      // In a real send a leftover rehearsal row is still owed a mail.
      if (dryRun) counts.dry += n;
      else counts.pending += n;
    } else if (row.status === "skipped" || row.status === "cancelled") {
      counts.skipped += n;
    } else counts.pending += n;
  }
  // People not yet written at all are still pending.
  counts.pending += todo.length + flagWaiting;
  if (flagWaiting > 0) {
    await logger.warn(
      "Broadcast waiting: the email programme flag is off for some recipients",
      { broadcastId: broadcast.id, waiting: flagWaiting },
      LOG_SOURCE
    );
  }
  return counts;
}

/**
 * The worker entry (every minute): start due broadcasts, then work each one
 * that is sending. A broadcast finishes when nobody is left to send to; a
 * deferred person is retried until the deferral limit drops them.
 */
export async function sendDueBroadcasts(
  options: { now?: Date; dryRun?: boolean } = {}
): Promise<void> {
  const now = options.now ?? newDate();
  const dryRun = options.dryRun ?? dryRunFromEnv();
  await startDue(now);
  const sending = await prisma.emailBroadcast.findMany({
    where: { status: "sending" },
    select: {
      id: true,
      category: true,
      segment: true,
      startedAt: true,
      createdBy: true,
    },
  });
  const live = new Set(sending.map((row) => row.id));
  for (const id of recipientSnapshots.keys()) {
    if (!live.has(id)) recipientSnapshots.delete(id);
  }
  const deadline = Date.now() + TICK_BUDGET_MS;
  for (const broadcast of sending) {
    const counts = await work(broadcast, deadline, dryRun);
    const finished = counts.pending === 0;
    if (finished) recipientSnapshots.delete(broadcast.id);
    const updated = await prisma.emailBroadcast.updateMany({
      where: { id: broadcast.id, status: "sending" },
      data: {
        sentCount: counts.sent,
        skippedCount: counts.skipped,
        ...(finished ? { status: "sent", finishedAt: newDate() } : {}),
      },
    });
    if (finished && updated.count === 1) {
      await recordAdminAudit({
        actorId: broadcast.createdBy,
        action: "email.broadcast_send",
        details: {
          broadcastId: broadcast.id,
          sent: counts.sent,
          skipped: counts.skipped,
          ...(dryRun ? { dry: counts.dry } : {}),
        },
      });
      await logger.info(
        "Broadcast finished",
        { broadcastId: broadcast.id, ...counts },
        LOG_SOURCE
      );
    }
  }
}
