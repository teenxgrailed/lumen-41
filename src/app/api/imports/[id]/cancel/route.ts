import { NextRequest } from "next/server";

import { cancelImportResponse } from "@/services/imports/http";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "ImportCancelAPI";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  return cancelImportResponse(auth.userId, id);
}
