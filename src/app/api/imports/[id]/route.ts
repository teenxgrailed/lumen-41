import { NextRequest } from "next/server";

import { getImportResponse } from "@/services/imports/http";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "ImportRunAPI";

/** Status, progress and warnings of one run. Owner only. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  return getImportResponse(auth.userId, id);
}
