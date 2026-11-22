import { NextRequest, NextResponse } from "next/server";

import { OpError } from "@/services/ops";
import { authenticateAgentRequest, opErrorResponse } from "@/services/ops/http";

export const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
} as const;

/**
 * The /api/learn routes: the signed-in session for the app, or a `needt_`
 * connector token for scripts and other tools (a token needs `needt.write` to
 * change anything). Learn is on for everybody (owner, 15.11.26: no flag).
 * Listed in api-route-auth-coverage.test.ts as an authenticating helper: it
 * returns the auth failure as `response` before a handler does anything.
 */
export async function learnAuth(
  request: NextRequest,
  logSource: string,
  options: { write?: boolean } = {}
): Promise<LearnAuth | { response: NextResponse }> {
  const auth = await authenticateAgentRequest(request, logSource, options);
  if (auth.response) return { response: auth.response };
  const userId = auth.userId!;
  return { userId, workspace: auth.workspace!, actor: auth.actor! };
}

type AgentAuth = Exclude<
  Awaited<ReturnType<typeof authenticateAgentRequest>>,
  { response: NextResponse }
>;

export interface LearnAuth {
  userId: string;
  workspace: NonNullable<AgentAuth["workspace"]>;
  actor: NonNullable<AgentAuth["actor"]>;
}

/** Run a learn handler: OpErrors become their JSON answer, the rest a 500. */
export async function learnRespond(
  logSource: string,
  run: () => Promise<unknown>,
  status = 200
) {
  try {
    return NextResponse.json(await run(), { status, headers: NO_STORE });
  } catch (error) {
    return opErrorResponse(error, logSource);
  }
}

/** The JSON body as an object, or INVALID_INPUT. */
export async function learnBody(request: NextRequest): Promise<unknown> {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new OpError("INVALID_INPUT", "Body must be a JSON object");
  return body;
}

/** Zod issues as one INVALID_INPUT error. */
export function invalid(message: string, details?: unknown): never {
  throw new OpError("INVALID_INPUT", message, details);
}
