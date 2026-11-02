import { recordAdminAudit } from "@/services/admin/audit";
import { loadPeople } from "@/services/email-lifecycle/people";
import type { EmailBroadcast, Prisma } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { EmailService } from "@/lib/email/email-service";
import { getEmailProgramSettings } from "@/lib/email/program-settings";
import { getBroadcastTemplate } from "@/lib/email/templates/lifecycle";
import { unsubscribeUrl } from "@/lib/email/unsubscribe";
import { SUPPORT_EMAIL } from "@/lib/legal/operator";
import { prisma } from "@/lib/prisma";

import {
  type BroadcastInput,
  type Segment,
  broadcastInputSchema,
  checkSchedule,
  exclusionReason,
  inSegment,
  validateButton,
} from "./rules";

export class BroadcastError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string
  ) {
    super(message);
    this.name = "BroadcastError";
  }
}

/** Where a person is mailed from: the app origin used in links. */
function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

const PAGE = 500;
/** Bounds one resolution so an enormous list cannot stall a request. */
const MAX_RESOLVE = 50_000;

export const BROADCAST_RULE_KEY = "broadcast";
export const broadcastDedupeKey = (broadcastId: string) =>
  `broadcast:${broadcastId}`;

function prefilterFor(segment: Segment): Prisma.UserWhereInput {
  return segment === "students"
    ? {
        OR: [
          { email: { endsWith: ".edu", mode: "insensitive" } },
          { email: { contains: ".ac.", mode: "insensitive" } },
        ],
      }
    : {};
}

/**
 * Everyone who would receive the broadcast right now: in the segment and not
 * excluded. This is the number shown before sending and the list the sender
 * works through.
 */
export async function resolveRecipientIds(
  segment: Segment,
  category: "updates" | "offers",
  now: Date = newDate()
): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | undefined;
  while (out.length < MAX_RESOLVE) {
    const page = await prisma.user.findMany({
      where: {
        email: { not: null },
        emailVerified: { not: null },
        sandboxKind: null,
        ...prefilterFor(segment),
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (page.length === 0) break;
    const people = await loadPeople(
      page.map((row) => row.id),
      now
    );
    for (const person of people.values()) {
      if (
        inSegment(segment, person, now) &&
        !exclusionReason(person, category)
      ) {
        out.push(person.userId);
      }
    }
    if (page.length < PAGE) break;
    cursor = page[page.length - 1].id;
  }
  return out;
}

export async function countRecipients(
  segment: Segment,
  category: "updates" | "offers",
  now: Date = newDate()
): Promise<number> {
  return (await resolveRecipientIds(segment, category, now)).length;
}

function parseInput(raw: unknown): BroadcastInput {
  const parsed = broadcastInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BroadcastError(
      400,
      parsed.error.issues[0]?.message ?? "That broadcast is not valid."
    );
  }
  const problem = validateButton(parsed.data);
  if (problem) throw new BroadcastError(400, problem);
  return parsed.data;
}

async function load(id: string): Promise<EmailBroadcast> {
  const row = await prisma.emailBroadcast.findUnique({ where: { id } });
  if (!row) throw new BroadcastError(404, "That broadcast does not exist.");
  return row;
}

export type Actor = { id: string; kind: "admin" | "claude" };

export async function createBroadcast(actor: Actor, raw: unknown) {
  const input = parseInput(raw);
  return prisma.emailBroadcast.create({
    data: {
      subject: input.subject,
      preheader: input.preheader,
      paragraphs: input.paragraphs,
      buttonLabel: input.buttonLabel?.trim() || null,
      buttonUrl: input.buttonUrl?.trim() || null,
      category: input.category,
      segment: input.segment,
      createdBy: actor.id,
      createdByKind: actor.kind,
    },
  });
}

/** Editing resets the test: a changed broadcast must be tested again. */
export async function updateBroadcast(id: string, raw: unknown) {
  const current = await load(id);
  if (current.status !== "draft" && current.status !== "scheduled") {
    throw new BroadcastError(
      409,
      "Only a draft or scheduled broadcast can be edited."
    );
  }
  const input = parseInput(raw);
  return prisma.emailBroadcast.update({
    where: { id },
    data: {
      subject: input.subject,
      preheader: input.preheader,
      paragraphs: input.paragraphs,
      buttonLabel: input.buttonLabel?.trim() || null,
      buttonUrl: input.buttonUrl?.trim() || null,
      category: input.category,
      segment: input.segment,
      // Back to a draft: the schedule was for the old content.
      status: "draft",
      scheduledAt: null,
      recipientCount: null,
      contentUpdatedAt: newDate(),
    },
  });
}

/** The template input of a stored broadcast, for a preview and for sending. */
export function paragraphsOf(
  row: Pick<EmailBroadcast, "paragraphs">
): string[] {
  return Array.isArray(row.paragraphs)
    ? row.paragraphs.filter((p): p is string => typeof p === "string")
    : [];
}

export function renderBroadcast(
  row: EmailBroadcast,
  footer: { name: string; address: string },
  unsubscribe: string,
  testPrefix = false
) {
  const template = getBroadcastTemplate({
    name: null,
    appUrl: appUrl(),
    unsubscribeUrl: unsubscribe,
    footer,
    subject: testPrefix ? `[TEST] ${row.subject}` : row.subject,
    preheader: row.preheader,
    paragraphs: paragraphsOf(row),
    button:
      row.buttonLabel && row.buttonUrl
        ? { label: row.buttonLabel, url: row.buttonUrl }
        : null,
  });
  return template;
}

/**
 * One mail to the signed-in admin's address, `[TEST]` in the subject. Its
 * unsubscribe link names an account that does not exist, so using it changes
 * nothing for anyone.
 */
export async function sendTest(id: string, adminEmail: string) {
  const row = await load(id);
  const { footer } = await getEmailProgramSettings();
  if (!footer) {
    throw new BroadcastError(
      409,
      "Set the footer name and address in System Settings first."
    );
  }
  const rendered = renderBroadcast(
    row,
    footer,
    unsubscribeUrl(
      `test-${row.id}`,
      row.category === "offers" ? "offers" : "updates"
    ),
    true
  );
  const result = await EmailService.sendEmail({
    to: adminEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    commercial: true,
    programme: true,
    unsubscribeUrl: unsubscribeUrl(
      `test-${row.id}`,
      row.category === "offers" ? "offers" : "updates"
    ),
    replyTo: SUPPORT_EMAIL,
  });
  if (!result.jobId) {
    throw new BroadcastError(
      409,
      "The test was not sent (suppressed address or sandbox account)."
    );
  }
  await prisma.emailBroadcast.update({
    where: { id },
    data: { testedAt: newDate() },
  });
  return { sentTo: adminEmail };
}

/**
 * Schedules for a time at least 15 minutes ahead and within 30 days, after a
 * test made since the last edit. Writes the audit row (actor, segment, count)
 * with the status change. The owner or Claude may call this; the same rules
 * bind both.
 */
export async function scheduleBroadcast(
  actor: Actor,
  id: string,
  at: Date,
  confirmCount?: number | null,
  now: Date = newDate()
) {
  const row = await load(id);
  if (row.status !== "draft" && row.status !== "scheduled") {
    throw new BroadcastError(409, "This broadcast can no longer be scheduled.");
  }
  const { footer } = await getEmailProgramSettings();
  const recipientCount = await countRecipients(
    row.segment as Segment,
    row.category as "updates" | "offers",
    now
  );
  const check = checkSchedule({
    at,
    now,
    testedAt: row.testedAt,
    contentUpdatedAt: row.contentUpdatedAt,
    footerResolved: Boolean(footer),
    segment: row.segment as Segment,
    recipientCount,
    confirmCount,
  });
  if (!check.ok) throw new BroadcastError(409, check.reason);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.emailBroadcast.update({
      where: { id },
      data: { status: "scheduled", scheduledAt: at, recipientCount },
    });
    await recordAdminAudit(
      {
        actorId: actor.id,
        action: "email.broadcast_schedule",
        details: {
          broadcastId: id,
          by: actor.kind,
          segment: row.segment,
          recipients: recipientCount,
          at: at.toISOString(),
        },
      },
      tx
    );
    return updated;
  });
}

/** Cancels a draft, a scheduled broadcast, or one being sent (the count so far is kept). */
export async function cancelBroadcast(
  actor: Actor,
  id: string,
  now: Date = newDate()
) {
  const row = await load(id);
  if (!["draft", "scheduled", "sending"].includes(row.status)) {
    throw new BroadcastError(409, "This broadcast is already finished.");
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.emailBroadcast.update({
      where: { id },
      data: { status: "cancelled", cancelledAt: now },
    });
    await recordAdminAudit(
      {
        actorId: actor.id,
        action: "email.broadcast_cancel",
        details: { broadcastId: id, by: actor.kind, was: row.status },
      },
      tx
    );
    return updated;
  });
}

export async function listBroadcasts(limit = 50) {
  return prisma.emailBroadcast.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
}

/** The result page: sent, skipped by reason, bounced and complained counts. */
export async function broadcastResult(id: string) {
  const row = await load(id);
  const dedupe = broadcastDedupeKey(id);
  const grouped = await prisma.emailSend.groupBy({
    by: ["status", "reason"],
    where: { ruleKey: BROADCAST_RULE_KEY, dedupeKey: dedupe },
    _count: { _all: true },
  });
  const skipped: Record<string, number> = {};
  let sent = 0;
  let pending = 0;
  let bounced = 0;
  let complained = 0;
  for (const group of grouped) {
    const n = group._count._all;
    if (group.status === "sent") {
      sent += n;
      // The Resend webhook marks a delivered row `bounced` or `complained`.
      if (group.reason === "bounced") bounced += n;
      if (group.reason === "complained") complained += n;
    } else if (group.status === "skipped" || group.status === "cancelled") {
      const key = group.reason ?? "other";
      skipped[key] = (skipped[key] ?? 0) + n;
    } else pending += n;
  }
  return { broadcast: row, sent, skipped, pending, bounced, complained };
}
