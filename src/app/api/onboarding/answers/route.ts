import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { onboardingAnswersSchema } from "@/lib/onboarding/answers";
import { readSavedAnswers, saveAnswers } from "@/lib/onboarding/server";

const LOG_SOURCE = "OnboardingAnswersAPI";

/** The saved answers, or `{ answers: null }` when no week was ever saved. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ answers: await readSavedAnswers(auth.userId) });
}

const putSchema = z.object({
  answers: onboardingAnswersSchema,
  timeZone: z.string().max(64).default("UTC"),
});

/** Saves the answers (areas, picks, repeats, rank, hours, rhythm, calendars, reminders). */
export async function PUT(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid answers." }, { status: 400 });
  }
  await saveAnswers(auth.userId, parsed.data.answers, parsed.data.timeZone);
  return NextResponse.json({ saved: true });
}
