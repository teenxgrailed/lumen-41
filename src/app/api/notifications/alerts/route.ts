import { NextRequest } from "next/server";

import { alertsResponse } from "@/services/notifications/http";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "notifications-alerts-route";

/** `?channel=mac&since=ISO`: what may interrupt now (see services/notifications/alerts). */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if (auth.response) return auth.response;
  return alertsResponse(auth, request.nextUrl.searchParams);
}
