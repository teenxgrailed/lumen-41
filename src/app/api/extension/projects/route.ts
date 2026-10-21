import { NextRequest, NextResponse } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { WorkspaceRole } from "@prisma/client";

import { routeErrorResponse } from "@/lib/api/route-error";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ExtensionProjectsAPI";

/**
 * GET /api/extension/projects -> { projects: [{ id, name, color }] }
 * Open projects in the token's workspace, for the browser extension's project
 * picker (capture, project tabs). Bearer token, `needt.read`.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.VIEWER
  );
  if ("response" in auth) return auth.response;
  try {
    const projects = await prisma.project.findMany({
      where: {
        ...workspaceDataScopeWhere(auth.workspace, auth.userId),
        status: "active",
      },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { id: true, name: true, color: true },
    });
    return NextResponse.json({ projects });
  } catch (error) {
    return routeErrorResponse(error, "Failed to list projects", LOG_SOURCE);
  }
}
