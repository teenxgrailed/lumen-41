/* Shared by `/api/notifications` (signed-in session) and
 * `/api/connect/notifications` (bearer token): same query, same body. */
import { NextResponse } from "next/server";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";

import {
  type FeedGroup,
  NotificationReadError,
  getNotificationFeed,
  markNotificationsRead,
} from "./feed";

export async function feedResponse(
  auth: { userId: string; workspace?: WorkspaceAccess },
  params: URLSearchParams
) {
  const group = (params.get("group") ?? "activity") as FeedGroup;
  if (group !== "activity" && group !== "reminders") {
    return NextResponse.json(
      { error: "group must be activity or reminders" },
      { status: 400 }
    );
  }
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? undefined : Number(rawLimit);
  if (limit !== undefined && !Number.isInteger(limit)) {
    return NextResponse.json(
      { error: "limit must be an integer" },
      { status: 400 }
    );
  }
  const before = params.get("before");
  if (before && Number.isNaN(new Date(before).getTime())) {
    return NextResponse.json(
      { error: "before must be an ISO time" },
      { status: 400 }
    );
  }
  const page = await getNotificationFeed({
    userId: auth.userId,
    workspace: auth.workspace,
    group,
    limit,
    before,
  });
  return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } });
}

export async function readResponse(userId: string, request: Request) {
  let body: { all?: unknown; keys?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  try {
    await markNotificationsRead({
      userId,
      all: body.all === true,
      keys: body.keys,
    });
  } catch (error) {
    if (error instanceof NotificationReadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  return new NextResponse(null, { status: 204 });
}
