import { NextRequest, NextResponse } from "next/server";

import { adminActorId, recordAdminAudit } from "@/services/admin/audit";
import {
  deleteAnnouncement,
  getAnnouncement,
  updateAnnouncement,
} from "@/services/popups/announcements";

import { requireAdmin } from "@/lib/auth/api-auth";
import { announcementUpdateSchema } from "@/lib/popups/schema";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;
  const announcement = await getAnnouncement(id);
  if (!announcement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ announcement });
}

/** PATCH: edit any fields. Status changes go through `/publish`. */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;

  const parsed = announcementUpdateSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "That is not valid." },
      { status: 400 }
    );
  }
  const result = await updateAnnouncement(id, parsed.data);
  if (!result.ok) {
    return result.code === "slug_taken"
      ? NextResponse.json({ error: "That slug is taken." }, { status: 409 })
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const actorId = await adminActorId(request);
  if (actorId) {
    await recordAdminAudit({
      actorId,
      action: "announcement.update",
      details: { announcementId: id, fields: Object.keys(parsed.data) },
    });
  }
  return NextResponse.json({ announcement: result.announcement });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;
  if (!(await deleteAnnouncement(id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const actorId = await adminActorId(request);
  if (actorId) {
    await recordAdminAudit({
      actorId,
      action: "announcement.delete",
      details: { announcementId: id },
    });
  }
  return NextResponse.json({ ok: true });
}
