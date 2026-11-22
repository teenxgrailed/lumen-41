import { NextRequest, NextResponse } from "next/server";

import {
  clearFirstReplanDemo,
  firstReplanState,
} from "@/services/onboarding/first-replan-demo";
import { WorkspaceRole } from "@prisma/client";

import { recordActivation } from "@/lib/activation-events";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { FIRST_REPLAN_ONBOARDING } from "@/lib/feature-flags-keys";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "FirstReplanAPI";

/**
 * The demo on Today: `{ demo: null }` unless the `first_replan_onboarding`
 * flag is on for this account and the demo rows are still there.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    if (!(await isFeatureEnabled(FIRST_REPLAN_ONBOARDING, auth.userId))) {
      return NextResponse.json({ demo: null });
    }
    return NextResponse.json({ demo: await firstReplanState(auth.userId) });
  } catch (error) {
    logger.warn(
      "Could not read the first-replan demo",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ demo: null });
  }
}

/**
 * The card was drawn for this person: the `first_replan_card_shown` activation
 * event, once per account. Nothing is recorded unless the flag is on and the
 * demo is still there, so a stray call counts for nothing.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    if (
      (await isFeatureEnabled(FIRST_REPLAN_ONBOARDING, auth.userId)) &&
      (await firstReplanState(auth.userId))
    ) {
      recordActivation("first_replan_card_shown", auth.userId);
    }
  } catch (error) {
    logger.warn(
      "Could not record the first-replan card view",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
  }
  return NextResponse.json({ ok: true });
}

/**
 * Removes the two demo tasks and nothing else. `?reason=skip` is the Skip
 * button on the first card and records `first_replan_skipped` (once per
 * account); the later "Remove the demo" does not.
 */
export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  try {
    const removed = await clearFirstReplanDemo(auth.userId);
    if (removed > 0 && request.nextUrl.searchParams.get("reason") === "skip") {
      recordActivation("first_replan_skipped", auth.userId);
    }
    return NextResponse.json({ removed });
  } catch (error) {
    logger.error(
      "Could not remove the first-replan demo",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Could not remove the demo" },
      { status: 500 }
    );
  }
}
