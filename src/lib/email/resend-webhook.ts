import { createHmac, timingSafeEqual } from "node:crypto";

import { newDate } from "@/lib/date-utils";
import { switchOffAllOptional } from "@/lib/email/preferences";
import {
  getEmailProgramSettings,
  trackingActive,
} from "@/lib/email/program-settings";
import { normalizeMailbox, suppressAddress } from "@/lib/email/suppression";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ResendWebhook";

/** Svix signatures older than this are refused. */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export type SvixRejection = "missing_headers" | "stale_timestamp" | "no_match";

export type SvixVerification =
  | { ok: true }
  | { ok: false; reason: SvixRejection; skewSeconds: number | null };

type SvixInput = {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  nowSeconds?: number;
};

/**
 * The base64 part of a signing secret, tolerant of how it reaches the
 * environment: surrounding quotes, whitespace, a literal or escaped newline
 * and an upper-case `whsec_` prefix are all dropped.
 */
export function signingKeyText(secret: string): string {
  let text = secret.trim();
  for (let i = 0; i < 2; i += 1) {
    text = text
      .replace(/(\\n|\\r)+$/g, "")
      .trim()
      .replace(/^(["'])([\s\S]*)\1$/, "$2")
      .trim();
  }
  return text.replace(/^whsec_/i, "");
}

/**
 * Verifies a Svix-signed webhook (what Resend sends): HMAC-SHA256 over
 * `${svix-id}.${svix-timestamp}.${raw body}` with the base64 secret that
 * follows `whsec_`, compared against every `v1,<signature>` in the header.
 * The body must be the raw text, not re-serialised JSON. A refusal carries a
 * reason (never the secret, signature or body) and the clock skew in seconds.
 */
export function checkSvixSignature(input: SvixInput): SvixVerification {
  const { secret, id, timestamp, signature, body } = input;
  if (!secret || !id || !timestamp || !signature) {
    return { ok: false, reason: "missing_headers", skewSeconds: null };
  }
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) {
    return { ok: false, reason: "missing_headers", skewSeconds: null };
  }
  const now = input.nowSeconds ?? Math.floor(newDate().getTime() / 1000);
  const skewSeconds = Math.round(now - sentAt);
  if (Math.abs(skewSeconds) > WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale_timestamp", skewSeconds };
  }

  const key = Buffer.from(signingKeyText(secret), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest();

  for (const part of signature.split(" ")) {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;
    const given = Buffer.from(value, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: "no_match", skewSeconds };
}

export function verifySvixSignature(input: SvixInput): boolean {
  return checkSvixSignature(input).ok;
}

type ResendEvent = {
  type?: unknown;
  data?: {
    email_id?: unknown;
    to?: unknown;
    bounce?: { type?: unknown } | null;
  } | null;
};

function recipients(event: ResendEvent): string[] {
  const to = event.data?.to;
  const list = Array.isArray(to) ? to : typeof to === "string" ? [to] : [];
  return list
    .filter((value): value is string => typeof value === "string")
    .map(normalizeMailbox)
    .filter((value) => value.includes("@"));
}

/** A complaint is a plain "stop": every optional mail for that account goes off. */
async function switchOptionalMailOff(address: string) {
  const user = await prisma.user.findUnique({
    where: { email: address },
    select: { id: true },
  });
  if (!user) return;
  await prisma.user.updateMany({
    where: { id: user.id, commercialEmailsOptOutAt: null },
    data: { commercialEmailsOptOutAt: newDate() },
  });
  await prisma.notificationSettings.updateMany({
    where: { userId: user.id },
    data: { digest: false },
  });
  await switchOffAllOptional(user.id, "complaint");
}

function emailId(event: ResendEvent): string | null {
  const id = event.data?.email_id;
  return typeof id === "string" && id ? id : null;
}

/** Marks the ledger row of a delivered mail, for the broadcast result page. */
async function markDelivery(event: ResendEvent, reason: string) {
  const id = emailId(event);
  if (!id) return;
  await prisma.emailSend.updateMany({
    where: { resendId: id, status: "sent", reason: null },
    data: { reason },
  });
}

export type WebhookOutcome = "applied" | "ignored";

/**
 * Applies one Resend event. A hard (Permanent) bounce, a complaint and a
 * provider suppression put the address on our suppression list; a soft bounce
 * is only logged. Other event types are ignored.
 */
export async function applyResendEvent(
  event: ResendEvent
): Promise<WebhookOutcome> {
  const type = typeof event.type === "string" ? event.type : "";
  const addresses = recipients(event);

  if (type === "email.bounced") {
    const hard = event.data?.bounce?.type === "Permanent";
    if (!hard) {
      logger.info("Soft bounce, not suppressed", {}, LOG_SOURCE);
      return "ignored";
    }
    for (const address of addresses) await suppressAddress(address, "bounce");
    await markDelivery(event, "bounced");
    return "applied";
  }
  if (type === "email.complained") {
    for (const address of addresses) {
      await suppressAddress(address, "complaint");
      await switchOptionalMailOff(address);
    }
    await markDelivery(event, "complained");
    return "applied";
  }
  if (type === "email.opened" || type === "email.clicked") {
    /* Counted only while the tracking window in System Settings is open
       (owner decision 9); afterwards the events are acknowledged and dropped. */
    const id = emailId(event);
    if (!id) return "ignored";
    const settings = await getEmailProgramSettings();
    if (!trackingActive(settings, newDate())) return "ignored";
    await prisma.emailSend.updateMany({
      where: { resendId: id },
      data:
        type === "email.opened"
          ? { opens: { increment: 1 } }
          : { clicks: { increment: 1 } },
    });
    return "applied";
  }
  if (type === "email.suppressed") {
    for (const address of addresses) await suppressAddress(address, "provider");
    return "applied";
  }
  return "ignored";
}
