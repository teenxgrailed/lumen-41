import { NextRequest } from "next/server";

import { readJsonBody, runGoalOp } from "@/services/goals/http";
import { OpError } from "@/services/ops";
import { opErrorResponse } from "@/services/ops/http";

const LOG_SOURCE = "goals-tasks-route";

type Params = { params: Promise<{ id: string }> };

/**
 * Put a task under a goal: `{ title }` makes a new one (`task.create` with
 * `goalId`), `{ taskId }` links an existing one (`task.update`). Either way
 * the answer carries `actionId` for undo.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const parsed = await readJsonBody(request, LOG_SOURCE);
  if ("response" in parsed) return parsed.response;
  const { title, taskId } = parsed.body;
  if (typeof taskId === "string" && taskId) {
    return runGoalOp(
      request,
      LOG_SOURCE,
      "task.update",
      { taskId, goalId: id },
      { write: true }
    );
  }
  if (typeof title === "string" && title.trim()) {
    return runGoalOp(
      request,
      LOG_SOURCE,
      "task.create",
      { title: title.trim(), goalId: id },
      { write: true, status: 201 }
    );
  }
  return opErrorResponse(
    new OpError("INVALID_INPUT", "Send { title } or { taskId }"),
    LOG_SOURCE
  );
}
