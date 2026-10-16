import { NextRequest, NextResponse } from "next/server";

import {
  HabitCompletionDateError,
  setHabitCompletionToday,
} from "@/services/habits/habit-service";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { habitDateFromKey } from "@/lib/habit-completion-date";

const LOG_SOURCE = "HabitCompletionDayAPI";
/** The furthest back a day can be marked: the history route's own limit. */
const MAX_DAYS_BACK = 400;
const DAY_MS = 24 * 60 * 60 * 1000;
type RouteContext = { params: Promise<{ id: string; date: string }> };

/**
 * Mark (PUT) or unmark (DELETE) one habit on one day, `yyyy-MM-dd` in the
 * person's time zone. Today is the same write as `completions/today`; the
 * future is refused (400), and so is a day more than 400 days back.
 */
async function setCompletionOn(
  request: NextRequest,
  context: RouteContext,
  completed: boolean
) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  if (!auth.workspace) {
    return NextResponse.json(
      { error: "Workspace unavailable" },
      { status: 500 }
    );
  }

  const { id, date } = await context.params;
  const asked = habitDateFromKey(date).getTime();
  if (newDate().getTime() - asked > MAX_DAYS_BACK * DAY_MS) {
    return NextResponse.json(
      { error: `A day more than ${MAX_DAYS_BACK} days back cannot be changed` },
      { status: 400 }
    );
  }
  try {
    const result = await setHabitCompletionToday({
      userId: auth.userId,
      workspace: auth.workspace,
      habitId: id,
      completed,
      dateKey: date,
    });
    if (!result) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof HabitCompletionDateError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export function PUT(request: NextRequest, context: RouteContext) {
  return setCompletionOn(request, context, true);
}

export function DELETE(request: NextRequest, context: RouteContext) {
  return setCompletionOn(request, context, false);
}
