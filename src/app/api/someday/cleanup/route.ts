import { NextRequest, NextResponse } from "next/server";

import { authorize, failure, parseBody } from "@/services/day-plan/http";
import { cleanupSomeday } from "@/services/day-plan/someday";
import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "someday-cleanup-api";

const bodySchema = z
  .object({ keepTaskIds: z.array(z.string().min(1)).max(1_000).optional() })
  .strict();

/**
 * POST /api/someday/cleanup: the weekly one tap. Someday tasks a week old are
 * archived (never deleted; restore brings them back), except `keepTaskIds`.
 */
export async function POST(request: NextRequest) {
  const auth = await authorize(
    request,
    LOG_SOURCE,
    "someday-cleanup",
    await authenticateRequest(request, LOG_SOURCE)
  );
  if ("response" in auth) return auth.response;
  try {
    const input = await parseBody(request, bodySchema);
    return NextResponse.json(
      await cleanupSomeday(auth.userId, { keepTaskIds: input.keepTaskIds })
    );
  } catch (error) {
    return failure(error, LOG_SOURCE);
  }
}
