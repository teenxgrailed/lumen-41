import { NextRequest, NextResponse } from "next/server";

import { authenticateBlockingRequest } from "@/services/blocking/auth";
import { blockingProfileUpdateSchema } from "@/services/blocking/profile";
import {
  deleteBlockingProfile,
  getBlockingProfile,
  updateBlockingProfile,
} from "@/services/blocking/store";
import { WorkspaceRole } from "@prisma/client";

import { routeErrorResponse } from "@/lib/api/route-error";

const LOG_SOURCE = "BlockingProfileAPI";

type Params = { params: Promise<{ id: string }> };

const notFound = () =>
  NextResponse.json({ error: "Profile not found" }, { status: 404 });

/** GET /api/blocking/profiles/:id -> { profile } */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await authenticateBlockingRequest(
    request,
    LOG_SOURCE,
    WorkspaceRole.VIEWER
  );
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    const profile = await getBlockingProfile(auth.userId, id);
    return profile ? NextResponse.json({ profile }) : notFound();
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to read blocking profile",
      LOG_SOURCE
    );
  }
}

/** PATCH /api/blocking/profiles/:id { any profile field } -> { profile } */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await authenticateBlockingRequest(
    request,
    LOG_SOURCE,
    WorkspaceRole.EDITOR
  );
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const parsed = blockingProfileUpdateSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid profile", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  try {
    const profile = await updateBlockingProfile(auth.userId, id, parsed.data);
    return profile ? NextResponse.json({ profile }) : notFound();
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to update blocking profile",
      LOG_SOURCE
    );
  }
}

/** DELETE /api/blocking/profiles/:id -> { deleted: true } */
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await authenticateBlockingRequest(
    request,
    LOG_SOURCE,
    WorkspaceRole.EDITOR
  );
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    return (await deleteBlockingProfile(auth.userId, id))
      ? NextResponse.json({ deleted: true })
      : notFound();
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to delete blocking profile",
      LOG_SOURCE
    );
  }
}
