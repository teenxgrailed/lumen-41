import { NextRequest, NextResponse } from "next/server";

import { deleteConnection } from "@/services/pinterest/connection";
import { pinterestErrorResponse } from "@/services/pinterest/http";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "PinterestDisconnectAPI";

/** Forget the person's Pinterest tokens and stop every board's sync. Imported pictures stay. */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    await deleteConnection(auth.userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return pinterestErrorResponse(
      error,
      "Failed to disconnect Pinterest",
      LOG_SOURCE,
      "Could not disconnect Pinterest."
    );
  }
}
