import { NextRequest } from "next/server";

import {
  createReminderResponse,
  listRemindersResponse,
} from "@/services/reminders/http";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "reminders-route";

/**
 * Reminders on tasks, events, or on their own. `GET ?taskId=&eventId=&status=`
 * lists them; `POST` sets one (see reminderCreateSchema). The connector API
 * has the same at /api/connect/reminders.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if (auth.response) return auth.response;
  return listRemindersResponse(auth.userId, request.nextUrl.searchParams);
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if (auth.response) return auth.response;
  return createReminderResponse(auth.userId, request);
}
