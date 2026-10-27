import { NextRequest } from "next/server";

import { snoozeResponse } from "@/services/notifications/http";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "notifications-snooze-route";

/** `{ keys, until }`: hides feed rows until then (the bell's "Tomorrow"). */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if (auth.response) return auth.response;
  return snoozeResponse(auth.userId, request);
}
