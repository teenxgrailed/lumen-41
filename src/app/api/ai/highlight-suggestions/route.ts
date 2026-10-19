import { NextRequest, NextResponse } from "next/server";

import {
  suggestHighlights,
  suggestionCandidatesSchema,
  suggestionDateSchema,
} from "@/services/ai/highlight-suggestions";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { accountRule, enforceRateLimits } from "@/lib/security/rate-limit";

const LOG_SOURCE = "ai-highlight-suggestions";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/**
 * POST { date, candidates } -> { status, suggestions }
 * 2 or 3 of the offered tasks as the day's highlight, each with a one-line
 * reason (Pro and Lifetime). `unavailable` when no AI can answer, `upgrade` on
 * a Free account. One AI action per call; 6 calls an hour per account.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const date = suggestionDateSchema.safeParse(body.date);
  const candidates = suggestionCandidatesSchema.safeParse(body.candidates);
  if (!date.success) return bad("date must be YYYY-MM-DD");
  if (!candidates.success) return bad("candidates must be 1 to 12 tasks");

  const limited = await enforceRateLimits(
    [accountRule(auth.userId, "ai-highlight-suggestions:account", 6, 3600)],
    { route: "/api/ai/highlight-suggestions", userId: auth.userId }
  );
  if (limited) return limited;

  try {
    const outcome = await suggestHighlights(
      auth.userId,
      date.data,
      candidates.data
    );
    return NextResponse.json(outcome, { headers: NO_STORE });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to suggest highlights",
      LOG_SOURCE,
      "Could not suggest a highlight."
    );
  }
}
