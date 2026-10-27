import { NextRequest } from "next/server";

import { readJsonBody, runGoalOp } from "@/services/goals/http";

const LOG_SOURCE = "goals-id-route";

type Params = { params: Promise<{ id: string }> };

/** One goal with subgoals, counted tasks and recent check-ins (`goal.get`). */
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  return runGoalOp(request, LOG_SOURCE, "goal.get", { goalId: id });
}

/** Change a goal (`goal.update`). Undo with the returned `actionId`. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const parsed = await readJsonBody(request, LOG_SOURCE);
  if ("response" in parsed) return parsed.response;
  return runGoalOp(
    request,
    LOG_SOURCE,
    "goal.update",
    { ...parsed.body, goalId: id },
    { write: true }
  );
}

/** Archive a goal (`goal.archive`); Undo brings it back. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  return runGoalOp(
    request,
    LOG_SOURCE,
    "goal.archive",
    { goalId: id },
    { write: true }
  );
}
