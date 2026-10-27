import { NextRequest } from "next/server";

import { readJsonBody, runGoalOp } from "@/services/goals/http";
import { OpError } from "@/services/ops";
import { authenticateAgentRequest, opErrorResponse } from "@/services/ops/http";

const LOG_SOURCE = "goals-task-route";

type Params = { params: Promise<{ id: string; taskId: string }> };

/**
 * A task on the goal's page: `{ done }` ticks or reopens it
 * (`task.complete` / `task.uncomplete`), `{ linked: false }` takes it off
 * the goal (`task.update` with `goalId: null`).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { taskId } = await params;
  const auth = await authenticateAgentRequest(request, LOG_SOURCE, {
    write: true,
  });
  if (auth.response) return auth.response;
  const parsed = await readJsonBody(request, LOG_SOURCE);
  if ("response" in parsed) return parsed.response;
  const { done, linked } = parsed.body;
  if (linked === false) {
    return runGoalOp(
      auth,
      LOG_SOURCE,
      "task.update",
      { taskId, goalId: null },
      { write: true }
    );
  }
  if (typeof done === "boolean") {
    return runGoalOp(
      auth,
      LOG_SOURCE,
      done ? "task.complete" : "task.uncomplete",
      { taskId },
      { write: true }
    );
  }
  return opErrorResponse(
    new OpError("INVALID_INPUT", "Send { done } or { linked: false }"),
    LOG_SOURCE
  );
}
