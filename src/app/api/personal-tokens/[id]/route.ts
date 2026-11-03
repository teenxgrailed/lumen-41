import { NextRequest, NextResponse } from "next/server";

import {
  PersonalTokenError,
  renamePersonalToken,
  revokePersonalToken,
} from "@/services/connectors/personal-tokens";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { accountRule, enforceRateLimits } from "@/lib/security/rate-limit";

const LOG_SOURCE = "personal-tokens-api";

type Params = { params: Promise<{ id: string }> };

function failure(error: unknown, what: string) {
  if (error instanceof PersonalTokenError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  logger.error(
    `Failed to ${what} personal token`,
    { error: error instanceof Error ? error.message : String(error) },
    LOG_SOURCE
  );
  return NextResponse.json(
    { error: `Failed to ${what} token` },
    { status: 500 }
  );
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;
    const limited = await enforceRateLimits(
      [accountRule(auth.userId, "personal-tokens:change", 60, 60 * 60)],
      { route: "/api/personal-tokens/[id]", userId: auth.userId }
    );
    if (limited) return limited;

    const { id } = await params;
    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
    } | null;
    return NextResponse.json(
      await renamePersonalToken(auth.userId, id, body?.name)
    );
  } catch (error) {
    return failure(error, "rename");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;
    const limited = await enforceRateLimits(
      [accountRule(auth.userId, "personal-tokens:change", 60, 60 * 60)],
      { route: "/api/personal-tokens/[id]", userId: auth.userId }
    );
    if (limited) return limited;

    const { id } = await params;
    await revokePersonalToken(auth.userId, id);
    return NextResponse.json({ revoked: true });
  } catch (error) {
    return failure(error, "revoke");
  }
}
