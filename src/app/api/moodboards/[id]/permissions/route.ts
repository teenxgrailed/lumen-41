import { NextRequest, NextResponse } from "next/server";

import {
  MoodboardAccessServiceError,
  inviteMoodboardMember,
  listMoodboardAccessGrants,
  removeMoodboardAccessGrant,
  setMoodboardAccessGrant,
} from "@/services/moodboards/moodboard-access-service";
import { MoodboardAccessRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "MoodboardPermissionsAPI";
type RouteContext = { params: Promise<{ id: string }> };

function accessError(error: unknown) {
  if (error instanceof MoodboardAccessServiceError) {
    return NextResponse.json({ error: error.code }, { status: error.status });
  }
  throw error;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    return NextResponse.json(await listMoodboardAccessGrants(auth, id));
  } catch (error) {
    return accessError(error);
  }
}

/**
 * Give someone access: `{ userId, role }`, or `{ email, role }` for a person
 * already in the workspace (nobody is emailed). `email` takes VIEWER or
 * EDITOR only; FULL_ACCESS is given by `userId`.
 */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const role = Object.values(MoodboardAccessRole).includes(body.role)
    ? (body.role as MoodboardAccessRole)
    : null;
  if (typeof body.email === "string" && role) {
    const email = body.email.trim();
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      role === MoodboardAccessRole.FULL_ACCESS
    ) {
      return NextResponse.json(
        { error: "A valid email and a VIEWER or EDITOR role are required" },
        { status: 400 }
      );
    }
    try {
      return NextResponse.json({
        grant: await inviteMoodboardMember(auth, id, email, role),
      });
    } catch (error) {
      return accessError(error);
    }
  }
  if (typeof body.userId !== "string" || !role) {
    return NextResponse.json(
      { error: "userId and role are required" },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json({
      grant: await setMoodboardAccessGrant(auth, id, body.userId, role),
    });
  } catch (error) {
    return accessError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  if (typeof body.userId !== "string") {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  try {
    await removeMoodboardAccessGrant(auth, id, body.userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return accessError(error);
  }
}
