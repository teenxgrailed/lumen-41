import { NextRequest, NextResponse } from "next/server";

import {
  deleteItemComment,
  setItemCommentResolved,
  updateCommentSchema,
} from "@/services/moodboards/moodboard-comment-service";

import { authenticateRequest } from "@/lib/auth/api-auth";

import { moodboardItemErrorResponse, parseItemBody } from "../../../shared";

const LOG_SOURCE = "MoodboardItemCommentAPI";
type RouteContext = {
  params: Promise<{ id: string; itemId: string; commentId: string }>;
};

/** Resolve or reopen a comment: `{ resolved }`. The author or full access. */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id, itemId, commentId } = await params;
  const body = await parseItemBody(request, updateCommentSchema);
  if (!body.ok) return body.response;
  try {
    return NextResponse.json({
      comment: await setItemCommentResolved(
        auth,
        id,
        itemId,
        commentId,
        body.data.resolved
      ),
    });
  } catch (error) {
    return moodboardItemErrorResponse(
      error,
      "Failed to update Moodboard item comment",
      LOG_SOURCE,
      "Could not change the comment."
    );
  }
}

/** Delete a comment. The author or full access. */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id, itemId, commentId } = await params;
  try {
    await deleteItemComment(auth, id, itemId, commentId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return moodboardItemErrorResponse(
      error,
      "Failed to delete Moodboard item comment",
      LOG_SOURCE,
      "Could not delete the comment."
    );
  }
}
