import { NextRequest, NextResponse } from "next/server";

import { authenticateBlockingRequest } from "@/services/blocking/auth";
import { blockingProfileCreateSchema } from "@/services/blocking/profile";
import {
  BlockingLimitError,
  createBlockingProfile,
  listBlockingProfiles,
} from "@/services/blocking/store";
import { WorkspaceRole } from "@prisma/client";

import { routeErrorResponse } from "@/lib/api/route-error";

const LOG_SOURCE = "BlockingProfilesAPI";

/** GET /api/blocking/profiles -> { profiles } */
export async function GET(request: NextRequest) {
  const auth = await authenticateBlockingRequest(
    request,
    LOG_SOURCE,
    WorkspaceRole.VIEWER
  );
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json({
      profiles: await listBlockingProfiles(auth.userId),
    });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to list blocking profiles",
      LOG_SOURCE
    );
  }
}

/** POST /api/blocking/profiles { name, sites?, apps?, mode?, triggers... } -> { profile } */
export async function POST(request: NextRequest) {
  const auth = await authenticateBlockingRequest(
    request,
    LOG_SOURCE,
    WorkspaceRole.EDITOR
  );
  if ("response" in auth) return auth.response;
  const parsed = blockingProfileCreateSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid profile", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  try {
    const profile = await createBlockingProfile(auth.userId, parsed.data);
    return NextResponse.json({ profile }, { status: 201 });
  } catch (error) {
    if (error instanceof BlockingLimitError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return routeErrorResponse(
      error,
      "Failed to create blocking profile",
      LOG_SOURCE
    );
  }
}
