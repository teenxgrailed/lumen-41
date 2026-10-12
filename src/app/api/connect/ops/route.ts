import { NextRequest, NextResponse } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { listOps } from "@/services/ops";
import { WorkspaceRole } from "@prisma/client";

/** The operations an external tool can run, with JSON Schema for each input. */
export async function GET(request: NextRequest) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.VIEWER
  );
  if (auth.response) return auth.response;
  return NextResponse.json({ ops: listOps() });
}
