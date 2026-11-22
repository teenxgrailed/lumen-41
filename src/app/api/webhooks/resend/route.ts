import { NextRequest, NextResponse } from "next/server";

import {
  applyResendEvent,
  checkSvixSignature,
} from "@/lib/email/resend-webhook";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ResendWebhookRoute";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * Resend delivery events (bounced, complained, suppressed). The Svix
 * signature on the raw body is the only credential; a stale or wrong one is a
 * 400 and stores nothing. A retried event (same `svix-id`) is acknowledged and
 * not applied again.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    logger.error("RESEND_WEBHOOK_SECRET is not set", {}, LOG_SOURCE);
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const body = await request.text();
  const id = request.headers.get("svix-id");
  const verdict = checkSvixSignature({
    secret,
    id,
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
    body,
  });
  if (!verdict.ok || !id) {
    /* Error level so the reason is kept in the Log table: a warn line only
       reached stdout and was lost on restart (15.11.2026). Reason, clock skew
       and shapes only: never the secret, signature or body. */
    const signature = request.headers.get("svix-signature");
    logger.error(
      "Resend webhook rejected",
      {
        reason: verdict.ok ? "missing_headers" : verdict.reason,
        skewSeconds: verdict.ok ? null : verdict.skewSeconds,
        svixTimestamp: request.headers.get("svix-timestamp"),
        bodyLength: body.length,
        signatureCount: signature ? signature.split(" ").length : 0,
      },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  let event: { type?: unknown };
  try {
    event = JSON.parse(body) as { type?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    await prisma.resendWebhookEvent.create({
      data: { id, type: typeof event.type === "string" ? event.type : "" },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return NextResponse.json({ ok: true });
    logger.error(
      "Resend event ledger write failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }

  try {
    await applyResendEvent(event);
  } catch (error) {
    /* Forget the id so Resend's retry is applied, not skipped as a duplicate. */
    await prisma.resendWebhookEvent.delete({ where: { id } }).catch(() => {});
    logger.error(
      "Resend event failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  /* One line per accepted event, so a delivery can be confirmed from the logs. */
  logger.info(
    "Resend event accepted",
    { id, type: typeof event.type === "string" ? event.type : "" },
    LOG_SOURCE
  );
  return NextResponse.json({ ok: true });
}
