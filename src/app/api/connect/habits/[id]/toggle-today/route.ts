import { NextRequest, NextResponse } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { toggleHabitToday } from "@/services/habits/habit-service";
import { WorkspaceRole } from "@prisma/client";

import { publishRealtimeEventSafe } from "@/lib/realtime/publish";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

/**
 * POST /api/connect/habits/:id/toggle-today (needt.write): flips today's
 * check-in (the day in the person's time zone). A body `{ "completed": true }`
 * sets it instead of flipping, so a retried call is safe.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.EDITOR
  );
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  const completed =
    body && typeof body.completed === "boolean" ? body.completed : undefined;
  const { id } = await params;
  const result = await toggleHabitToday({
    userId: auth.userId,
    workspace: auth.workspace,
    habitId: id,
    completed,
  });
  if (!result) {
    return NextResponse.json(
      { error: "Habit not found" },
      { status: 404, headers: NO_STORE }
    );
  }
  await publishRealtimeEventSafe(auth.userId, "tasks-updated");
  return NextResponse.json(result, { headers: NO_STORE });
}
