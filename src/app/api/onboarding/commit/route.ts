import { NextRequest, NextResponse } from "next/server";

import { WorkspaceRole } from "@prisma/client";
import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { onboardingAnswersSchema, planBlocker } from "@/lib/onboarding/answers";
import { commitOnboarding, readSavedAnswers } from "@/lib/onboarding/server";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";

const LOG_SOURCE = "OnboardingCommitAPI";

const bodySchema = z.object({
  /** Omit to use the saved answers. */
  answers: onboardingAnswersSchema.optional(),
  timeZone: z.string().max(64).default("UTC"),
});

/**
 * Creates the picked tasks, repeats (as habits), projects, work schedules and
 * reminders, then lets the account's scheduler place them. Running it again
 * replaces what an earlier run made and leaves everything else alone.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  const limited = await enforceRateLimits(
    [
      ipRule(request, "onboarding-commit:ip", 20, 60 * 60),
      accountRule(auth.userId, "onboarding-commit:account", 10, 60 * 60),
    ],
    { route: "/api/onboarding/commit", userId: auth.userId }
  );
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const answers = parsed.data.answers ?? (await readSavedAnswers(auth.userId));
  if (!answers) {
    return NextResponse.json({ error: "No answers saved." }, { status: 400 });
  }
  const blocker = planBlocker(answers);
  if (blocker) return NextResponse.json({ error: blocker }, { status: 422 });

  try {
    const result = await commitOnboarding({
      userId: auth.userId,
      workspace: auth.workspace!,
      answers,
      timeZone: parsed.data.timeZone,
    });
    return NextResponse.json(result);
  } catch (error) {
    logger.error(
      "Onboarding commit failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Could not write the week." },
      { status: 500 }
    );
  }
}
