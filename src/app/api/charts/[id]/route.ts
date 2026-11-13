import { NextRequest } from "next/server";

import { readJsonBody, runGoalOp as runChartOp } from "@/services/goals/http";
import { authenticateAgentRequest } from "@/services/ops/http";

const LOG_SOURCE = "charts-id-route";

type Params = { params: Promise<{ id: string }> };

/** One chart block with its series (`chart.get`). */
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await authenticateAgentRequest(request, LOG_SOURCE);
  if (auth.response) return auth.response;
  return runChartOp(auth, LOG_SOURCE, "chart.get", { chartId: id });
}

/** Change a chart block (`chart.update`). Undo with the returned `actionId`. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await authenticateAgentRequest(request, LOG_SOURCE, {
    write: true,
  });
  if (auth.response) return auth.response;
  const parsed = await readJsonBody(request, LOG_SOURCE);
  if ("response" in parsed) return parsed.response;
  return runChartOp(
    auth,
    LOG_SOURCE,
    "chart.update",
    { ...parsed.body, chartId: id },
    { write: true }
  );
}

/** Remove a chart block (`chart.delete`); Undo brings it back. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await authenticateAgentRequest(request, LOG_SOURCE, {
    write: true,
  });
  if (auth.response) return auth.response;
  return runChartOp(
    auth,
    LOG_SOURCE,
    "chart.delete",
    { chartId: id },
    { write: true }
  );
}
