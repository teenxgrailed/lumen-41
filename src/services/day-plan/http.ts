import { NextRequest, NextResponse } from "next/server";

import type { z } from "zod";

import type { authenticateRequest } from "@/lib/auth/api-auth";
import { dayPlanEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";

import { DayPlanError } from "./rules";

/**
 * Shared front of every day-plan and Someday route: authenticates, applies the
 * same per-IP and per-account limits as `ai/parse-tasks` (the draft can run the
 * AI), and maps plan refusals to JSON bodies.
 */
export async function authorize(
  request: NextRequest,
  logSource: string,
  route: string,
  auth: Awaited<ReturnType<typeof authenticateRequest>>
): Promise<{ userId: string } | { response: NextResponse }> {
  if ("response" in auth && auth.response) return { response: auth.response };
  const userId = auth.userId as string;
  const limited = await enforceRateLimits(
    [
      ipRule(request, `${route}:ip`, 60, 60),
      accountRule(userId, `${route}:account`, 30, 60),
    ],
    { route: `/api/${route}`, userId }
  );
  if (limited) return { response: limited };
  return { userId };
}

/**
 * The `day_plan` kill switch for writes: off, every write is refused (404
 * `disabled`) and nothing changes. Reads stay open, and the stored plans stay
 * exactly as they are, so switching it back on loses nothing.
 */
export async function assertDayPlanOn(userId: string): Promise<void> {
  if (!(await dayPlanEnabled(userId))) {
    throw new DayPlanError("disabled", 404, "The day plan is switched off");
  }
}

export function failure(error: unknown, logSource: string): NextResponse {
  if (error instanceof DayPlanError) {
    return NextResponse.json(
      { error: error.code, message: error.message, ...error.details },
      { status: error.status }
    );
  }
  logger.error(
    "Day plan request failed",
    { error: error instanceof Error ? error.message : String(error) },
    logSource
  );
  return NextResponse.json({ error: "internal" }, { status: 500 });
}

/** Reads and validates a JSON body; a bad body is a 400, never a 500. */
export async function parseBody<S extends z.ZodTypeAny>(
  request: NextRequest,
  schema: S
): Promise<z.infer<S>> {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new DayPlanError(
      "invalid_input",
      400,
      parsed.error.issues.map((issue) => issue.message).join("; ")
    );
  }
  return parsed.data;
}
