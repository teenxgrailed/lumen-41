import { NextRequest } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import {
  clearSampleResponse,
  sampleStatusResponse,
  seedSampleResponse,
} from "@/services/onboarding/sample-http";
import { WorkspaceRole } from "@prisma/client";

/** Token form of /api/onboarding/sample (docs/connector-api.md). */
export async function GET(request: NextRequest) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.VIEWER
  );
  if ("response" in auth) return auth.response;
  return sampleStatusResponse(auth.userId);
}

export async function POST(request: NextRequest) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.EDITOR
  );
  if ("response" in auth) return auth.response;
  const body: unknown = await request.json().catch(() => ({}));
  return seedSampleResponse({
    userId: auth.userId,
    workspaceId: auth.workspace.workspaceId,
    body,
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.EDITOR
  );
  if ("response" in auth) return auth.response;
  return clearSampleResponse(auth.userId);
}
