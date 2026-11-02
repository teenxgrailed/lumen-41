import { NextRequest, NextResponse } from "next/server";

import {
  PersonalTokenError,
  createPersonalToken,
  listPersonalTokens,
} from "@/services/connectors/personal-tokens";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { refuseSandbox } from "@/lib/sandbox/guard";
import { accountRule, enforceRateLimits } from "@/lib/security/rate-limit";

const LOG_SOURCE = "personal-tokens-api";

/** Token management is session-only: a bearer token cannot mint or list tokens. */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;

    return NextResponse.json({ tokens: await listPersonalTokens(auth.userId) });
  } catch (error) {
    logger.error(
      "Failed to list personal tokens",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to list tokens" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;
    const locked = await refuseSandbox(auth.userId, "api_tokens");
    if (locked) return locked;
    const limited = await enforceRateLimits(
      [accountRule(auth.userId, "personal-tokens:create", 20, 60 * 60)],
      { route: request.nextUrl.pathname, userId: auth.userId }
    );
    if (limited) return limited;

    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
    } | null;
    const { token, entry } = await createPersonalToken(auth.userId, body?.name);
    // The plaintext is in this response only; it cannot be read again.
    return NextResponse.json({ ...entry, token }, { status: 201 });
  } catch (error) {
    if (error instanceof PersonalTokenError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    logger.error(
      "Failed to create personal token",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to create token" },
      { status: 500 }
    );
  }
}
