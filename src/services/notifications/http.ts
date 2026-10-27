/* Shared by `/api/notifications` (signed-in session) and
 * `/api/connect/notifications` (bearer token): same query, same body. */
import { NextResponse } from "next/server";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";

import { alertsSince } from "./alerts";
import {
  type FeedGroup,
  NotificationReadError,
  getNotificationFeed,
  markNotificationsRead,
  snoozeNotifications,
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

/** `{ keys, until }`: hides feed rows until `until` ("Tomorrow"). */
export async function snoozeResponse(userId: string, request: Request) {
  let body: { keys?: unknown; until?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  try {
    const result = await snoozeNotifications({
      userId,
      keys: body.keys,
      until: newDate(typeof body.until === "string" ? body.until : NaN),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof NotificationReadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

/**
 * What may interrupt on a channel now (`?channel=mac&since=ISO`): the rows
 * that arrived since `since`, after Settings → Notifications decided. The
 * Mac app polls it and shows each as a system notification.
 */
export async function alertsResponse(
  auth: { userId: string; workspace?: WorkspaceAccess },
  params: URLSearchParams
) {
  const channel = params.get("channel") ?? "mac";
  if (channel !== "mac" && channel !== "inApp") {
    return NextResponse.json(
      { error: "channel must be mac or inApp" },
      { status: 400 }
    );
  }
  const since = params.get("since");
  const sinceDate = since ? newDate(since) : null;
  if (since && Number.isNaN(sinceDate?.getTime())) {
    return NextResponse.json(
      { error: "since must be an ISO time" },
      { status: 400 }
    );
  }
  const result = await alertsSince({
    userId: auth.userId,
    workspace: auth.workspace,
    channel,
    since: sinceDate,
  });
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
