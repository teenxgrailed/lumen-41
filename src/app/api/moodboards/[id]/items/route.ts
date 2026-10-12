import { NextRequest, NextResponse } from "next/server";

import {
  createMoodboardItem,
  createMoodboardItemSchema,
  listMoodboardGrid,
  reorderMoodboardItems,
  reorderMoodboardItemsSchema,
} from "@/services/moodboards/moodboard-item-service";

import { authenticateRequest } from "@/lib/auth/api-auth";

import { moodboardItemErrorResponse, parseItemBody } from "./shared";

const LOG_SOURCE = "MoodboardItemsAPI";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * A board's references in wall order (position, then createdAt, then id),
 * then, read-only, what the old canvas stored (ids start with `canvas:`,
 * `fromCanvas: true`); `canvasSkipped` counts canvas elements with no grid form.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    return NextResponse.json(await listMoodboardGrid(auth, id));
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

/**
 * Reorder: `{ "order": [itemId, …] }`. The listed references take, in that
 * order, the places the listed ones held, and the wall is renumbered 1..n.
 * Answers with the wall in its new order. An id that is not on the board is a
 * 404 and nothing moves.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const body = await parseItemBody(request, reorderMoodboardItemsSchema);
  if (!body.ok) return body.response;
  try {
    const items = await reorderMoodboardItems(auth, id, body.data.order);
    return NextResponse.json({ items });
  } catch (error) {
    return moodboardItemErrorResponse(
      error,
      "Failed to reorder Moodboard items",
      LOG_SOURCE,
      "Could not change the order."
    );
  }
}
