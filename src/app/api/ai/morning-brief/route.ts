import { NextRequest, NextResponse } from "next/server";

import {
  briefDateSchema,
  briefFactsSchema,
  dismissBrief,
  ensureBrief,
  readBrief,
} from "@/services/ai/morning-brief";
import { SubscriptionPlan } from "@prisma/client";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { getPlan } from "@/lib/entitlements";
import { accountRule, enforceRateLimits } from "@/lib/security/rate-limit";

const LOG_SOURCE = "ai-morning-brief";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/**
 * GET /api/ai/morning-brief?date=YYYY-MM-DD -> { brief } | { brief: null }
 * The cached brief for the day. Never generates, never costs an AI action.
 * Free accounts always get `{ brief: null }`.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const date = briefDateSchema.safeParse(
    request.nextUrl.searchParams.get("date")
  );
  if (!date.success) return bad("date must be YYYY-MM-DD");
  try {
    if ((await getPlan(auth.userId)) === SubscriptionPlan.FREE) {
      return NextResponse.json({ brief: null }, { headers: NO_STORE });
    }
    return NextResponse.json(
      { brief: await readBrief(auth.userId, date.data) },
      { headers: NO_STORE }
    );
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to read the morning brief",
      LOG_SOURCE,
      "Could not load the brief."
    );
  }
}

/**
 * POST { date, facts } -> { status, brief }
 * Writes the day's brief once (Pro and Lifetime): `ready` with the text,
 * `pending` while the first request is still writing it, `unavailable` when no
 * AI can answer, `upgrade` on a Free account. Asking again returns the cached
 * brief without another AI action.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const date = briefDateSchema.safeParse(body.date);
  const facts = briefFactsSchema.safeParse(body.facts);
  if (!date.success) return bad("date must be YYYY-MM-DD");
  if (!facts.success) return bad("facts are invalid");

  const limited = await enforceRateLimits(
    [accountRule(auth.userId, "ai-morning-brief:account", 6, 60)],
    { route: "/api/ai/morning-brief", userId: auth.userId }
  );
  if (limited) return limited;

  try {
    const outcome = await ensureBrief(
      auth.userId,
      date.data,
      facts.data,
      auth.workspace?.workspaceId
    );
    return NextResponse.json(outcome, { headers: NO_STORE });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to write the morning brief",
      LOG_SOURCE,
      "Could not write the brief."
    );
  }
}

/** PATCH { date, dismissed: true } -> { ok } . The brief stays cached. */
export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  const date = briefDateSchema.safeParse(body.date);
  if (!date.success) return bad("date must be YYYY-MM-DD");
  if (body.dismissed !== true) return bad("dismissed must be true");
  try {
    await dismissBrief(auth.userId, date.data);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to dismiss the morning brief",
      LOG_SOURCE,
      "Could not dismiss the brief."
    );
  }
}
