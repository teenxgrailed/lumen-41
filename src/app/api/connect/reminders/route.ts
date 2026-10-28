import { NextRequest } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import {
  createReminderResponse,
  listRemindersResponse,
} from "@/services/reminders/http";
import { WorkspaceRole } from "@prisma/client";

/** Reminders for tools using a connector token; same bodies as /api/reminders. */
export async function GET(request: NextRequest) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.VIEWER
  );
  if (auth.response) return auth.response;
  return listRemindersResponse(auth.userId, request.nextUrl.searchParams);
}

export async function POST(request: NextRequest) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.EDITOR
  );
  if (auth.response) return auth.response;
  return createReminderResponse(auth.userId, request);
}
