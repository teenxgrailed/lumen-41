import { NextRequest, NextResponse } from "next/server";

import {
  createCommentSchema,
  createItemComment,
  listItemComments,
} from "@/services/moodboards/moodboard-comment-service";

import { authenticateRequest } from "@/lib/auth/api-auth";

import { moodboardItemErrorResponse, parseItemBody } from "../../shared";

const LOG_SOURCE = "MoodboardItemCommentsAPI";
type RouteContext = { params: Promise<{ id: string; itemId: string }> };

/** The comments on one reference. Anyone who can see the board may read them. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id, itemId } = await params;
  try {
    return NextResponse.json({
      comments: await listItemComments(auth, id, itemId),
    });
  } catch (error) {
    return moodboardItemErrorResponse(
      error,
      "Failed to list Moodboard item comments",
      LOG_SOURCE,
      "Could not load the comments."
    );
  }
}

/** Comment on a reference: `{ body }`. Needs editor access. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id, itemId } = await params;
  const body = await parseItemBody(request, createCommentSchema);
  if (!body.ok) return body.response;
  try {
    return NextResponse.json(
      { comment: await createItemComment(auth, id, itemId, body.data) },
      { status: 201 }
    );
  } catch (error) {
    return moodboardItemErrorResponse(
      error,
      "Failed to comment on Moodboard item",
      LOG_SOURCE,
      "Could not post the comment."
    );
  }
}
