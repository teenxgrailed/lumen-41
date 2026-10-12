import { NextRequest, NextResponse } from "next/server";

import {
  createMoodboardItem,
  createMoodboardItemSchema,
  listMoodboardItems,
} from "@/services/moodboards/moodboard-item-service";

import { authenticateRequest } from "@/lib/auth/api-auth";

import { moodboardItemErrorResponse, parseItemBody } from "./shared";

const LOG_SOURCE = "MoodboardItemsAPI";
type RouteContext = { params: Promise<{ id: string }> };

/** A board's references in wall order (position, then createdAt, then id). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    const items = await listMoodboardItems(auth, id);
    return NextResponse.json({ items });
  } catch (error) {
    return moodboardItemErrorResponse(
      error,
      "Failed to list Moodboard items",
      LOG_SOURCE,
      "Could not load the board's references."
    );
  }
}

/** Add a reference. Without `position` it goes to the end of the wall. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const body = await parseItemBody(request, createMoodboardItemSchema);
  if (!body.ok) return body.response;
  try {
    const item = await createMoodboardItem(auth, id, body.data);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return moodboardItemErrorResponse(
      error,
      "Failed to create Moodboard item",
      LOG_SOURCE,
      "Could not add the reference."
    );
  }
}
