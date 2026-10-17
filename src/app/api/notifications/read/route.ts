import { NextRequest } from "next/server";

import { readResponse } from "@/services/notifications/http";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "notifications-read-route";

/** `{ all: true }` or `{ keys: [...] }`: marks feed items read. */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if (auth.response) return auth.response;
  return readResponse(auth.userId, request);
}
