import { NextRequest } from "next/server";

import { readJsonBody, runGoalOp } from "@/services/goals/http";

const LOG_SOURCE = "goals-route";

/**
 * Goals (Pro to create). GET lists them with progress (`goal.list`; filters
 * `status`, `parentId`, `projectId`, `includeArchived`); POST creates one
 * (`goal.create`), and the answer carries `actionId` for undo. Accepts the
 * session or a `needt_` token.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const input: Record<string, unknown> = {};
  for (const key of ["status", "parentId", "projectId"]) {
    const value = params.get(key);
    if (value) input[key] = value;
  }
  if (params.get("includeArchived") === "true") input.includeArchived = true;
  const limit = Number(params.get("limit"));
  if (Number.isInteger(limit) && limit > 0) input.limit = limit;
  return runGoalOp(request, LOG_SOURCE, "goal.list", input);
}

export async function POST(request: NextRequest) {
  const parsed = await readJsonBody(request, LOG_SOURCE);
  if ("response" in parsed) return parsed.response;
  return runGoalOp(request, LOG_SOURCE, "goal.create", parsed.body, {
    write: true,
    status: 201,
  });
}
