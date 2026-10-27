import { NextRequest } from "next/server";

import { readJsonBody, runGoalOp } from "@/services/goals/http";
import { authenticateAgentRequest } from "@/services/ops/http";

const LOG_SOURCE = "goals-convert-task-route";

/**
 * Convert a task to a goal (`goal.convert_from_task`, Pro): `{ taskId,
 * area?, parentId? }`. Its subtasks become tasks linked to the goal and the
 * task is archived; the `actionId` undoes all of it.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateAgentRequest(request, LOG_SOURCE, {
    write: true,
  });
  if (auth.response) return auth.response;
  const parsed = await readJsonBody(request, LOG_SOURCE);
  if ("response" in parsed) return parsed.response;
  return runGoalOp(auth, LOG_SOURCE, "goal.convert_from_task", parsed.body, {
    write: true,
    status: 201,
  });
}
