import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authSecret } from "@/lib/auth/auth-secret";
import { logger } from "@/lib/logger";
import { onboardingAnswersSchema, planBlocker } from "@/lib/onboarding/answers";
import { previewWeek } from "@/lib/onboarding/server";
import { enforceRateLimits, ipRule } from "@/lib/security/rate-limit";

const LOG_SOURCE = "OnboardingPlanAPI";

const bodySchema = z.object({
  answers: onboardingAnswersSchema,
  timeZone: z.string().max(64).default("UTC"),
  /** "Plan it differently" bumps this. */
  seed: z.number().int().min(0).max(1000).default(0),
});

/**
 * Plans the first week with the real scheduling engine and returns the
 * blocks, the numbers and the seven "planning" lines. Open to visitors with no
 * account (they see the sample calendar); with a session and a connected
 * calendar it plans around the real events. Writes nothing.
 */
export async function POST(request: NextRequest) {
  const limited = await enforceRateLimits(
    [ipRule(request, "onboarding-plan:ip", 60, 10 * 60)],
    { route: "/api/onboarding/plan" }
  );
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid answers.", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 }
    );
  }
  const blocker = planBlocker(parsed.data.answers);
  if (blocker) return NextResponse.json({ error: blocker }, { status: 422 });

  try {
    const token = await getToken({ req: request, secret: authSecret() });
    const plan = await previewWeek({
      answers: parsed.data.answers,
      userId: token?.sub ?? null,
      timeZone: parsed.data.timeZone,
      seed: parsed.data.seed,
    });
    return NextResponse.json({ plan });
  } catch (error) {
    logger.error(
      "Onboarding plan failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Could not plan the week." },
      { status: 500 }
    );
  }
}
