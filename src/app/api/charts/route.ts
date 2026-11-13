import { NextRequest } from "next/server";

import { readJsonBody, runGoalOp as runChartOp } from "@/services/goals/http";
import { authenticateAgentRequest } from "@/services/ops/http";

const LOG_SOURCE = "charts-route";

/**
 * Chart blocks. GET lists them with their series (`chart.list`; `projectId`
 * for one project's charts, `home=true` for Home's, `series=false` to leave
 * the numbers out); POST adds one (`chart.create`), and the answer carries
 * `actionId` for undo. Accepts the session or a `needt_` token.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateAgentRequest(request, LOG_SOURCE);
  if (auth.response) return auth.response;
  const params = request.nextUrl.searchParams;
  const input: Record<string, unknown> = {};
  const projectId = params.get("projectId");
  if (projectId) input.projectId = projectId;
  if (params.get("home") === "true") input.home = true;
  if (params.get("series") === "false") input.withSeries = false;
  if (params.get("includeArchived") === "true") input.includeArchived = true;
  return runChartOp(auth, LOG_SOURCE, "chart.list", input);
}

export async function POST(request: NextRequest) {
  const auth = await authenticateAgentRequest(request, LOG_SOURCE, {
    write: true,
  });
  if (auth.response) return auth.response;
  const parsed = await readJsonBody(request, LOG_SOURCE);
  if ("response" in parsed) return parsed.response;
  return runChartOp(auth, LOG_SOURCE, "chart.create", parsed.body, {
    write: true,
    status: 201,
  });
}
