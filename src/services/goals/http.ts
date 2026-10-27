import { NextRequest, NextResponse } from "next/server";

import { OpError, runOp } from "@/services/ops";
import { authenticateAgentRequest, opErrorResponse } from "@/services/ops/http";

/**
 * The /api/goals routes: the signed-in session (the app) or a `needt_`
 * connector token (scripts, agents), each running the goal ops, so the rules
 * and the undo log are the same everywhere. A token needs `needt.write` to
 * change anything.
 */
export async function runGoalOp(
  request: NextRequest,
  logSource: string,
  name: string,
  input: unknown,
  options: {
    write?: boolean;
    status?: number;
    pick?: (result: unknown) => unknown;
  } = {}
) {
  const auth = await authenticateAgentRequest(request, logSource, {
    write: options.write,
  });
  if (auth.response) return auth.response;
  try {
    const run = await runOp(name, input, {
      userId: auth.userId,
      workspace: auth.workspace!,
      actor: auth.actor,
    });
    const body = options.write
      ? run
      : options.pick
        ? options.pick(run.result)
        : run.result;
    return NextResponse.json(body, { status: options.status ?? 200 });
  } catch (error) {
    return opErrorResponse(error, logSource);
  }
}

/** The JSON body, or an INVALID_INPUT answer. */
export async function readJsonBody(
  request: NextRequest,
  logSource: string
): Promise<{ body: Record<string, unknown> } | { response: NextResponse }> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new OpError("INVALID_INPUT", "Body must be a JSON object");
    }
    return { body: body as Record<string, unknown> };
  } catch (error) {
    return {
      response: opErrorResponse(
        error instanceof OpError
          ? error
          : new OpError("INVALID_INPUT", "Body must be JSON"),
        logSource
      ),
    };
  }
}
