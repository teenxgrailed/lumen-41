import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { markOnboardingComplete } from "@/lib/onboarding/entry";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "OnboardingAPI";

/**
 * This intentionally derives progress from durable product data instead of
 * storing a client-only "seen" flag. Switching workspaces therefore always
 * reflects the next useful action and cannot expose another workspace's task
 * state.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const hasCalendar = await prisma.calendarFeed.count({
    where: { userId: auth.userId, enabled: true },
  });
  const hasTask = await prisma.task.count({
    where: {
      ...workspaceDataScopeWhere(auth.workspace, auth.userId),
      isArchived: false,
      isSample: false,
    },
  });

  return NextResponse.json({
    steps: [
      { id: "account", complete: true },
      { id: "calendar", complete: hasCalendar > 0 },
      { id: "workspace", complete: Boolean(auth.workspace) },
      { id: "task", complete: hasTask > 0 },
    ],
  });
}

/**
 * Marks onboarding finished (`User.onboardingCompletedAt`), from either flow.
 * The first finish keeps its date; calling it again changes nothing.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  await markOnboardingComplete(auth.userId);
  return NextResponse.json({ completed: true });
}
