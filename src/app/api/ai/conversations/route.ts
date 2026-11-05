import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ai-conversations";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  // `?latest=1`: only the newest conversation with its last 40 messages,
  // oldest first (Ask Needt restores it on load).
  if (request.nextUrl.searchParams.get("latest") === "1") {
    const latest = await prisma.aiConversation.findFirst({
      where: { userId: auth.userId, workspaceId: auth.workspace!.workspaceId },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 40 },
      },
    });
    return NextResponse.json({
      conversations: latest
        ? [{ ...latest, messages: [...latest.messages].reverse() }]
        : [],
    });
  }

  const conversations = await prisma.aiConversation.findMany({
    where: { userId: auth.userId, workspaceId: auth.workspace!.workspaceId },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: 40,
      },
    },
  });

  return NextResponse.json({ conversations });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 80)
      : "New chat";

  const conversation = await prisma.aiConversation.create({
    data: {
      userId: auth.userId,
      workspaceId: auth.workspace!.workspaceId,
      title,
    },
    include: { messages: true },
  });

  return NextResponse.json({ conversation });
}
