import { NextRequest, NextResponse } from "next/server";

import {
  deleteMoodboardItem,
  updateMoodboardItem,
  updateMoodboardItemSchema,
} from "@/services/moodboards/moodboard-item-service";

import { authenticateRequest } from "@/lib/auth/api-auth";

import { moodboardItemErrorResponse, parseItemBody } from "../shared";

const LOG_SOURCE = "MoodboardItemAPI";
type RouteContext = { params: Promise<{ id: string; itemId: string }> };

/** Change a reference: caption, ratio, colour, address, or its place. */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id, itemId } = await params;
  const body = await parseItemBody(request, updateMoodboardItemSchema);
  if (!body.ok) return body.response;
  try {
    const item = await updateMoodboardItem(auth, id, itemId, body.data);
    return NextResponse.json({ item });
  } catch (error) {
    return moodboardItemErrorResponse(
      error,
      "Failed to update Moodboard item",
      LOG_SOURCE,
      "Could not change the reference."
    );
  }
}

/** Remove a reference from the board. */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id, itemId } = await params;
  try {
    await deleteMoodboardItem(auth, id, itemId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return moodboardItemErrorResponse(
      error,
      "Failed to delete Moodboard item",
      LOG_SOURCE,
      "Could not remove the reference."
    );
  }
}
