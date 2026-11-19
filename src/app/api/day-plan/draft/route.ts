import { NextRequest, NextResponse } from "next/server";

import { authorize, failure, parseBody } from "@/services/day-plan/http";
import { buildDraft } from "@/services/day-plan/plan";
import { dateKeySchema } from "@/services/day-plan/rules";
import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "day-plan-draft-api";

const bodySchema = z
  .object({
    /** The day the draft is for (tomorrow, in the evening). */
    date: dateKeySchema,
    /** The evening note: saved to the day before, then turned into tasks. */
    note: z.string().max(5_000).optional(),
  })
  .strict();

/** POST /api/day-plan/draft: build (or extend) the draft of a date. */
export async function POST(request: NextRequest) {
  const auth = await authorize(
    request,
    LOG_SOURCE,
    "day-plan-draft",
    await authenticateRequest(request, LOG_SOURCE)
  );
  if ("response" in auth) return auth.response;
  try {
    const input = await parseBody(request, bodySchema);
    const result = await buildDraft(auth.userId, input.date, {
      note: input.note,
    });
    return NextResponse.json(result);
  } catch (error) {
    return failure(error, LOG_SOURCE);
  }
}
