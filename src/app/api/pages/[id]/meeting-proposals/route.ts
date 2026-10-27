import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { resolvePageAccess } from "@/lib/auth/page-auth";
import { prisma } from "@/lib/prisma";
import { createMeetingNoteProposal } from "@/services/pages/meeting-note-proposals";

const LOG_SOURCE = "MeetingNoteProposalsAPI";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!(await resolvePageAccess(auth, id))) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }
  const proposals = await prisma.meetingNoteProposal.findMany({
    where: { pageId: id, workspaceId: auth.workspace!.workspaceId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ proposals });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) ?? {};
  if (typeof body.summary !== "string") return NextResponse.json({ error: "Summary is required" }, { status: 400 });
  const proposal = await createMeetingNoteProposal(auth, id, body);
  if (!proposal) return NextResponse.json({ error: "Page not found" }, { status: 404 });
  return NextResponse.json({ proposal }, { status: 201 });
}
