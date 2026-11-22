import { NextRequest, NextResponse } from "next/server";

import { AnnouncementStatus } from "@prisma/client";
import { z } from "zod";

import { adminActorId, recordAdminAudit } from "@/services/admin/audit";
import { setAnnouncementStatus } from "@/services/popups/announcements";

import { requireAdmin } from "@/lib/auth/api-auth";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({ published: z.boolean() }).strict();

/**
 * POST /api/admin/announcements/:id/publish  `{ published: true | false }`
 *
 * The only way an announcement reaches people, and admin-only: an agent or a
 * connector may draft, never publish.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That is not valid." }, { status: 400 });
  }
  const result = await setAnnouncementStatus(
    id,
    parsed.data.published
      ? AnnouncementStatus.published
      : AnnouncementStatus.draft
  );
  if (!result.ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const actorId = await adminActorId(request);
  if (actorId) {
    await recordAdminAudit({
      actorId,
      action: parsed.data.published
        ? "announcement.publish"
        : "announcement.unpublish",
      details: { announcementId: id },
    });
  }
  return NextResponse.json({ announcement: result.announcement });
}
