import { NextRequest, NextResponse } from "next/server";

import {
  inviteWorkspaceMember,
  listWorkspaceInvites,
} from "@/services/workspaces/workspace-service";
import { WorkspaceRole } from "@prisma/client";
import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { refuseSandbox } from "@/lib/sandbox/guard";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";
import { workspaceApiError } from "@/lib/workspaces/api-response";

const LOG_SOURCE = "workspace-invites-route";
type RouteContext = { params: Promise<{ id: string }> };
const inviteSchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.nativeEnum(WorkspaceRole),
});

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  try {
    const { id } = await params;
    return NextResponse.json({
      invites: await listWorkspaceInvites(auth.userId, id),
    });
  } catch (error) {
    const response = workspaceApiError(error);
    if (response) return response;
    logger.error(
      "Failed to list workspace invites",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const locked = await refuseSandbox(auth.userId, "invites");
  if (locked) return locked;
  const limited = await enforceRateLimits(
    [
      ipRule(request, "workspace-invite:ip", 60, 60 * 60),
      accountRule(auth.userId, "workspace-invite:account", 20, 60 * 60),
    ],
    { route: request.nextUrl.pathname, userId: auth.userId }
  );
  if (limited) return limited;

  try {
    const [{ id }, input] = await Promise.all([
      params,
      request.json().then((body) => inviteSchema.parse(body)),
    ]);
    const invite = await inviteWorkspaceMember({
      userId: auth.userId,
      workspaceId: id,
      email: input.email,
      role: input.role,
    });
    return NextResponse.json({ invite }, { status: 201 });
  } catch (error) {
    const response = workspaceApiError(error);
    if (response) return response;
    logger.error(
      "Failed to invite workspace member",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
