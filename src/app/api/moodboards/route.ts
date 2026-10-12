import { NextRequest, NextResponse } from "next/server";

import {
  createMoodboard,
  listMoodboards,
} from "@/services/moodboards/moodboard-service";
import { WorkspaceRole } from "@prisma/client";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import {
  moodboardV3FieldsSchema,
  parseV3Fields,
} from "@/lib/needt3/api-fields";

const LOG_SOURCE = "MoodboardsAPI";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json({ moodboards: await listMoodboards(auth) });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to list Moodboards",
      LOG_SOURCE,
      "Could not load Moodboards."
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const v3 = parseV3Fields(moodboardV3FieldsSchema, body);
    if (!v3.ok) return NextResponse.json({ error: v3.error }, { status: 400 });
    const moodboard = await createMoodboard(auth, {
      title: typeof body.title === "string" ? body.title : undefined,
      projectId: v3.data.projectId,
    });
    if (!moodboard) {
      return NextResponse.json(
        { error: "Moodboard access denied" },
        { status: 403 }
      );
    }
    return NextResponse.json({ moodboard }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to create Moodboard",
      LOG_SOURCE,
      "Could not create Moodboard."
    );
  }
}
