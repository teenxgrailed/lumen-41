import { NextRequest, NextResponse } from "next/server";

import {
  getMoodboard,
  updateMoodboard,
} from "@/services/moodboards/moodboard-service";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import {
  moodboardV3FieldsSchema,
  parseV3Fields,
} from "@/lib/needt3/api-fields";

const LOG_SOURCE = "MoodboardDetailAPI";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    const moodboard = await getMoodboard(auth, id);
    return moodboard
      ? NextResponse.json({ moodboard })
      : NextResponse.json(
          { error: "Moodboard access denied" },
          { status: 403 }
        );
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to load Moodboard",
      LOG_SOURCE,
      "Could not load Moodboard."
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const v3 = parseV3Fields(moodboardV3FieldsSchema, body);
    if (!v3.ok) return NextResponse.json({ error: v3.error }, { status: 400 });
    const moodboard = await updateMoodboard(auth, id, {
      title: typeof body.title === "string" ? body.title : undefined,
      archived: typeof body.archived === "boolean" ? body.archived : undefined,
      ...v3.data,
    });
    return moodboard
      ? NextResponse.json({ moodboard })
      : NextResponse.json(
          { error: "Moodboard access denied" },
          { status: 403 }
        );
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to update Moodboard",
      LOG_SOURCE,
      "Could not update Moodboard."
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    const moodboard = await updateMoodboard(auth, id, { archived: true });
    return moodboard
      ? NextResponse.json({ moodboard })
      : NextResponse.json(
          { error: "Moodboard access denied" },
          { status: 403 }
        );
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to archive Moodboard",
      LOG_SOURCE,
      "Could not archive Moodboard."
    );
  }
}
