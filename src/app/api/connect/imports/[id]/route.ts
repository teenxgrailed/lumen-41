import { NextRequest } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { getImportResponse } from "@/services/imports/http";
import { WorkspaceRole } from "@prisma/client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.VIEWER
  );
  if ("response" in auth) return auth.response;
  const { id } = await params;
  return getImportResponse(auth.userId, id);
}
