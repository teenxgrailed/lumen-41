import { NextResponse } from "next/server";

import {
  MoodboardItemAccessError,
  MoodboardTrashedError,
} from "@/services/moodboards/moodboard-item-service";

import { routeErrorResponse } from "@/lib/api/route-error";

import { PinterestApiError } from "./client";
import { PinterestPlanError } from "./connection";

/**
 * One answer per way a Pinterest call can fail. `code` is what the screens
 * switch on: PRO_REQUIRED (402), RECONNECT (401: the grant ended),
 * NOT_APPROVED (403: Pinterest has not approved the app for this account),
 * RATE_LIMITED (429).
 */
export function pinterestErrorResponse(
  error: unknown,
  message: string,
  source: string,
  publicMessage: string
) {
  if (error instanceof PinterestPlanError) {
    return NextResponse.json(
      { error: error.message, code: "PRO_REQUIRED" },
      { status: 402 }
    );
  }
  if (error instanceof MoodboardItemAccessError) {
    return NextResponse.json(
      { error: "Moodboard access denied" },
      { status: 403 }
    );
  }
  if (error instanceof MoodboardTrashedError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof PinterestApiError) {
    switch (error.code) {
      case "unauthorized":
        return NextResponse.json(
          { error: error.message, code: "RECONNECT" },
          { status: 401 }
        );
      case "access_denied":
        return NextResponse.json(
          { error: error.message, code: "NOT_APPROVED" },
          { status: 403 }
        );
      case "forbidden":
        return NextResponse.json(
          { error: error.message, code: "RECONNECT" },
          { status: 403 }
        );
      case "not_found":
        return NextResponse.json({ error: error.message }, { status: 404 });
      case "rate_limited":
        return NextResponse.json(
          { error: error.message, code: "RATE_LIMITED" },
          { status: 429 }
        );
      default:
        return NextResponse.json({ error: error.message }, { status: 502 });
    }
  }
  return routeErrorResponse(error, message, source, publicMessage);
}
