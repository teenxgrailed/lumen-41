import { NextRequest } from "next/server";

import {
  clearSampleResponse,
  sampleStatusResponse,
  seedSampleResponse,
} from "@/services/onboarding/sample-http";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "OnboardingSampleAPI";

/** Whether examples are still on the account: `{ present, counts }`. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  return sampleStatusResponse(auth.userId);
}

/** Creates the sample day, once per account (docs/connector-api.md). */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  const body: unknown = await request.json().catch(() => ({}));
  return seedSampleResponse({
    userId: auth.userId,
    workspaceId: auth.workspace!.workspaceId,
    body,
  });
}

/** Removes every example still on the account, and only those. */
export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  return clearSampleResponse(auth.userId);
}
