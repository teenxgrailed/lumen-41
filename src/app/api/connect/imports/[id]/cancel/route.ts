import { NextRequest } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { cancelImportResponse } from "@/services/imports/http";
import { WorkspaceRole } from "@prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.VIEWER
  );
  if ("response" in auth) return auth.response;
  const { id } = await params;
  return cancelImportResponse(auth.userId, id);
}
