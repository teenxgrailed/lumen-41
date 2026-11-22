import { NextRequest, NextResponse } from "next/server";

import { earnsReviewStep } from "@/services/feedback/eligibility";
import { z } from "zod";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "FeedbackPromptAnswerAPI";

const TEXT_MAX = 2000;

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("dismiss") }),
  z.object({
    action: z.literal("answer"),
    rating: z.number().int().min(1).max(5).optional(),
    score: z.number().int().min(0).max(10).optional(),
    text: z.string().max(TEXT_MAX).optional(),
  }),
]);

/**
 * Answers or dismisses one prompt of the signed-in person. A prompt that is
 * not theirs is a 404, one already answered or dismissed a 409. An answer
 * must carry what its kind asks for (`rating`: 1-5, `nps`: 0-10, `idea` and
 * `annoyance`: some text). The reply says whether to offer "Leave a review?":
 * `{ ok: true, review: boolean }`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth && auth.response) return auth.response;
  const { id } = await params;
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid answer" }, { status: 400 });
    const body = parsed.data;

    // Scoped by the owner in the query: someone else's id looks like no id.
    const prompt = await prisma.feedbackPrompt.findFirst({
      where: { id, userId: auth.userId },
      select: { id: true, kind: true, answeredAt: true, dismissedAt: true },
    });
    if (!prompt)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (prompt.answeredAt || prompt.dismissedAt)
      return NextResponse.json({ error: "Already closed" }, { status: 409 });

    const now = newDate();
    if (body.action === "dismiss") {
      await prisma.feedbackPrompt.updateMany({
        where: { id, userId: auth.userId, answeredAt: null, dismissedAt: null },
        data: { dismissedAt: now },
      });
      return NextResponse.json({ ok: true, review: false });
    }

    const text = body.text?.trim() || null;
    const data: { rating?: number; score?: number; text: string | null } = {
      text,
    };
    if (prompt.kind === "rating") {
      if (body.rating === undefined)
        return NextResponse.json(
          { error: "A rating is needed" },
          { status: 400 }
        );
      data.rating = body.rating;
    } else if (prompt.kind === "nps") {
      if (body.score === undefined)
        return NextResponse.json(
          { error: "A score is needed" },
          { status: 400 }
        );
      data.score = body.score;
    } else if (!text) {
      return NextResponse.json(
        { error: "Some text is needed" },
        { status: 400 }
      );
    }

    const written = await prisma.feedbackPrompt.updateMany({
      where: { id, userId: auth.userId, answeredAt: null, dismissedAt: null },
      data: { ...data, answeredAt: now },
    });
    if (written.count === 0)
      return NextResponse.json({ error: "Already closed" }, { status: 409 });
    return NextResponse.json({
      ok: true,
      review: earnsReviewStep(prompt.kind, data),
    });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to save a feedback answer",
      LOG_SOURCE,
      "Could not save the answer."
    );
  }
}
