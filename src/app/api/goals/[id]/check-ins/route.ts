import { NextRequest } from "next/server";

import { readJsonBody, runGoalOp } from "@/services/goals/http";
import { authenticateAgentRequest } from "@/services/ops/http";

const LOG_SOURCE = "goals-check-ins-route";

type Params = { params: Promise<{ id: string }> };

/** The goal's last 20 check-ins, newest first. */
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await authenticateAgentRequest(request, LOG_SOURCE);
  if (auth.response) return auth.response;
  return runGoalOp(
    auth,
    LOG_SOURCE,
    "goal.get",
    { goalId: id },
    {
      pick: (result) => ({
        checkIns: (result as { checkIns: unknown[] }).checkIns,
      }),
    }
  );
}

/** Answer "How's <goal>?" (`goal.check_in`): `value`, `percent`, `note`. */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await authenticateAgentRequest(request, LOG_SOURCE, {
    write: true,
  });
  if (auth.response) return auth.response;
  const parsed = await readJsonBody(request, LOG_SOURCE);
  if ("response" in parsed) return parsed.response;
  return runGoalOp(
    auth,
    LOG_SOURCE,
    "goal.check_in",
    { ...parsed.body, goalId: id },
    { write: true, status: 201 }
  );
}
