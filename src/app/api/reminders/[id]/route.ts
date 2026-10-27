import { NextRequest } from "next/server";

import {
  deleteReminderResponse,
  getReminderResponse,
  updateReminderResponse,
} from "@/services/reminders/http";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "reminder-route";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if (auth.response) return auth.response;
  const { id } = await params;
  return getReminderResponse(auth.userId, id);
}

/** Change when it fires, or snooze it (`{ snoozeUntil }`). */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if (auth.response) return auth.response;
  const { id } = await params;
  return updateReminderResponse(auth.userId, id, request);
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if (auth.response) return auth.response;
  const { id } = await params;
  return deleteReminderResponse(auth.userId, id);
}
