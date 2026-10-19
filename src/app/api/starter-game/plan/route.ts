import { NextRequest, NextResponse } from "next/server";

import { makeStarterPlan } from "@/services/starter-game/agent";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { accountRule, enforceRateLimits } from "@/lib/security/rate-limit";
import { starterAnswersSchema } from "@/lib/starter-game";

const LOG_SOURCE = "starter-game-plan";

/**
 * POST { do, burn, reg } -> { status, items, suggestions }
 * The Starter game's one agent request, made after the third answer. One AI
 * action (hosted or own key, with Ask's caps) returns 12 to 16 tiles
 * `{ title, kind, suggestedGroup, durationMinutes | perWeek | horizon,
 * dueDay, firstStep }` plus one extra suggestion per lane. `status` is
 * "ready", "unavailable" (no AI can answer: nothing is made up) or "upgrade"
 * (Free). Nothing is created; see POST /api/starter-game/create.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const answers = starterAnswersSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!answers.success) {
    return NextResponse.json({ error: "Answers are invalid" }, { status: 400 });
  }

  const limited = await enforceRateLimits(
    [accountRule(auth.userId, "starter-game-plan:account", 6, 60)],
    { route: "/api/starter-game/plan", userId: auth.userId }
  );
  if (limited) return limited;

  try {
    return NextResponse.json(
      await makeStarterPlan({ userId: auth.userId, answers: answers.data }),
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to make the Starter game tiles",
      LOG_SOURCE,
      "Could not make your tiles."
    );
  }
}
