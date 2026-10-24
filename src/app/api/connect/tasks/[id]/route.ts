import { NextRequest, NextResponse } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { updateTaskFields } from "@/services/tasks/task-update";
import {
  taskFieldPatchFrom,
  taskUpdateBody,
} from "@/services/tasks/task-update-input";
import { WorkspaceRole } from "@prisma/client";

import { publishRealtimeEventSafe } from "@/lib/realtime/publish";

/**
 * Changes one task with the fields `needt_update_task` takes, through the same
 * service (`updateTaskFields`): title, notes, dates, estimate, priority,
 * labels, hours, project, links, and placement (`start` places and pins it,
 * `pinned` pins or unpins, `autoSchedule` turns the scheduler on or off for
 * it). Needs an editor role and the `needt.write` scope.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.EDITOR
  );
  if (auth.response) return auth.response;
  const { userId, workspace } = auth;
  const { id } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const body = taskUpdateBody.safeParse(json);
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 }
    );
  }
  const parsed = taskFieldPatchFrom(body.data);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result = await updateTaskFields({
    userId,
    workspace,
    taskId: id,
    patch: parsed.patch,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }
  if (result.changed) await publishRealtimeEventSafe(userId, "tasks-updated");
  return NextResponse.json({ changed: result.changed, task: result.task });
}
