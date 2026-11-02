import { newDate } from "@/lib/date-utils";
import { EmailService } from "@/lib/email/email-service";
import { getEmailProgramSettings } from "@/lib/email/program-settings";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import { SUPPORT_EMAIL } from "@/lib/legal/operator";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { recordAdminAudit } from "@/services/admin/audit";
import { loadPeople } from "@/services/email-lifecycle/people";

import {
  BROADCAST_RULE_KEY,
  broadcastDedupeKey,
  renderBroadcast,
  resolveRecipientIds,
} from "./service";
import {
  BATCH_SIZE,
  BROADCAST_CAP_DAYS,
  type BroadcastCategory,
  REQUESTS_PER_SECOND,
  type Segment,
  decideBroadcastSend,
} from "./rules";

const LOG_SOURCE = "EmailBroadcasts";
const DAY_MS = 24 * 60 * 60 * 1000;
/** One worker tick works for at most this long, then the next tick resumes. */
const TICK_BUDGET_MS = 45_000;
const GAP_MS = Math.ceil(1000 / REQUESTS_PER_SECOND);
const MAX_ATTEMPTS = 3;

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
      sentAt: { gte: new Date(now.getTime() - BROADCAST_CAP_DAYS * DAY_MS) },
    },
    _max: { sentAt: true },
  });
  const out = new Map<string, Date>();
  for (const row of rows) {
    if (row.userId && row._max.sentAt) out.set(row.userId, row._max.sentAt);
  }
  return out;
}

type Counts = { sent: number; skipped: number; pending: number };

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
  deadline: number
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
    return { sent: 0, skipped: 0, pending: 1 };
  }
  const segment = broadcast.segment as Segment;
  const category = broadcast.category as BroadcastCategory;
  const ids = await resolveRecipientIds(segment, category, now);

  const settled = await prisma.emailSend.findMany({
    where: {
      ruleKey: BROADCAST_RULE_KEY,
      dedupeKey: dedupe,
      userId: { in: ids },
    },
    select: { userId: true, status: true, deferUntil: true, attempts: true },
  });
  const done = new Set<string>();
  const waiting = new Map<string, Date>();
  for (const row of settled) {
    if (!row.userId) continue;
    if (row.status === "deferred" && row.deferUntil && row.deferUntil > now) {
      waiting.set(row.userId, row.deferUntil);
    } else if (row.status === "failed") {
      if (row.attempts >= MAX_ATTEMPTS) done.add(row.userId);
    } else if (row.status !== "deferred") {
      done.add(row.userId);
    }
  }
  let todo = ids.filter((id) => !done.has(id) && !waiting.has(id));

  while (todo.length > 0 && Date.now() < deadline) {
    if (!(await isStillSending(broadcast.id))) break;
    const batch = todo.slice(0, BATCH_SIZE);
    todo = todo.slice(BATCH_SIZE);
    const people = await loadPeople(batch, now);
    const last = await lastBroadcasts(batch, broadcast.id, now);
    let processed = 0;
    for (const userId of batch) {
      if (Date.now() >= deadline) break;
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
      // Claim first, send second: the unique slot is the exactly-once guard.
      let claimId: string | null = null;
      try {
        const existing = await prisma.emailSend.findUnique({ where: key });
        if (existing) {
          const taken = await prisma.emailSend.updateMany({
            where: {
              id: existing.id,
              updatedAt: existing.updatedAt,
              status: { in: ["deferred", "failed"] },
            },
            data: {
              status: "claimed",
              claimedAt: now,
              reason: null,
              attempts: { increment: 1 },
            },
          });
          claimId = taken.count === 1 ? existing.id : null;
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
    if (processed < batch.length) todo = [...batch.slice(processed), ...todo];
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
  const counts: Counts = { sent: 0, skipped: 0, pending: 0 };
  for (const row of tallies) {
    const n = row._count._all;
    if (row.status === "sent") counts.sent += n;
    else if (row.status === "skipped" || row.status === "cancelled") {
      counts.skipped += n;
    } else counts.pending += n;
  }
  // People not yet written at all are still pending.
  counts.pending += todo.length;
  return counts;
}

/**
 * The worker entry (every minute): start due broadcasts, then work each one
 * that is sending. A broadcast finishes when nobody is left to send to; a
 * deferred person is retried until the deferral limit drops them.
 */
export async function sendDueBroadcasts(
  options: { now?: Date } = {}
): Promise<void> {
  const now = options.now ?? newDate();
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
  const deadline = Date.now() + TICK_BUDGET_MS;
  for (const broadcast of sending) {
    const counts = await work(broadcast, deadline);
    const finished = counts.pending === 0;
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
