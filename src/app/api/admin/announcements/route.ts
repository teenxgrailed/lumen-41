import { NextRequest, NextResponse } from "next/server";

import { adminActorId, recordAdminAudit } from "@/services/admin/audit";
import {
  createAnnouncement,
  listAnnouncements,
} from "@/services/popups/announcements";

import { requireAdmin } from "@/lib/auth/api-auth";
import { announcementCreateSchema } from "@/lib/popups/schema";

/** GET /api/admin/announcements: every announcement with shown / clicked / dismissed counts. */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  return NextResponse.json({ announcements: await listAnnouncements() });
}

/** POST /api/admin/announcements: a new draft. Publishing is a separate call. */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const parsed = announcementCreateSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "That is not valid." },
      { status: 400 }
    );
  }
  const result = await createAnnouncement(parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { error: "That slug is taken." },
      { status: 409 }
    );
  }
  const actorId = await adminActorId(request);
  if (actorId) {
    await recordAdminAudit({
      actorId,
      action: "announcement.create",
      details: { announcementId: result.announcement.id, slug: parsed.data.slug },
    });
  }
  return NextResponse.json(
    { announcement: result.announcement },
    { status: 201 }
  );
}
