import { NextRequest, NextResponse } from "next/server";

import { authenticateAgentRequest, opErrorResponse } from "@/services/ops/http";

import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "easy-start-proposals";

/**
 * The person's pending Always easy start proposals ("suggest" mode), newest
 * first: what Apply would do to each task. Read with a session or a connector
 * token; applying and dismissing are `POST /api/easy-start/proposals/:id`.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateAgentRequest(request, LOG_SOURCE);
  if (auth.response) return auth.response;
  try {
    const proposals = await prisma.easyStartProposal.findMany({
      where: { userId: auth.userId, status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        taskId: true,
        reason: true,
        entry: true,
        title: true,
        subtasks: true,
        source: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ proposals });
  } catch (error) {
    return opErrorResponse(error, LOG_SOURCE);
  }
}
