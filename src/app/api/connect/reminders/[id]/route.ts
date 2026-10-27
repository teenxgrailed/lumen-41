import { NextRequest } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import {
  deleteReminderResponse,
  getReminderResponse,
  updateReminderResponse,
} from "@/services/reminders/http";
import { WorkspaceRole } from "@prisma/client";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.VIEWER
  );
  if (auth.response) return auth.response;
  const { id } = await params;
  return getReminderResponse(auth.userId, id);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.EDITOR
  );
  if (auth.response) return auth.response;
  const { id } = await params;
  return updateReminderResponse(auth.userId, id, request);
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.EDITOR
  );
  if (auth.response) return auth.response;
  const { id } = await params;
  return deleteReminderResponse(auth.userId, id);
}
