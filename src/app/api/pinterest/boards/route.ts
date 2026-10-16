import { NextRequest, NextResponse } from "next/server";

import { listPinterestBoards } from "@/services/pinterest/client";
import {
  assertPinterestPlan,
  withPinterest,
} from "@/services/pinterest/connection";
import { pinterestErrorResponse } from "@/services/pinterest/http";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "PinterestBoardsAPI";

/** The signed-in person's Pinterest boards (name, Pin count). */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    await assertPinterestPlan(auth.userId);
    const boards = await withPinterest(auth.userId, (token) =>
      listPinterestBoards(token)
    );
    return NextResponse.json({ boards });
  } catch (error) {
    return pinterestErrorResponse(
      error,
      "Failed to list Pinterest boards",
      LOG_SOURCE,
      "Could not load your Pinterest boards."
    );
  }
}
