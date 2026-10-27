import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { addCalendarDays, newDate, startOfWeek } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "WeeklyFocusTargetAPI";
const inputSchema = z.object({
  targetMinutes: z.number().int().min(0).max(10_080),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
});

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const target = await prisma.weeklyFocusTarget.findUnique({
    where: { userId_workspaceId: { userId: auth.userId, workspaceId: auth.workspace!.workspaceId } },
  });
  const weekStartsOn = target?.weekStartsOn === 0 ? 0 : 1;
  const start = startOfWeek(newDate(), { weekStartsOn });
  const end = addCalendarDays(start, 7);
  const progress = await prisma.focusSession.aggregate({
    where: {
      userId: auth.userId,
      completed: true,
      startedAt: { gte: start, lt: end },
      task: { workspaceId: auth.workspace!.workspaceId },
    },
    _sum: { elapsedMinutes: true },
  });
  return NextResponse.json({
    target: target ?? { targetMinutes: 300, weekStartsOn },
    range: { start: start.toISOString(), end: end.toISOString() },
    completedMinutes: progress._sum.elapsedMinutes ?? 0,
  });
}

export async function PUT(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid focus target" }, { status: 400 });
  const target = await prisma.weeklyFocusTarget.upsert({
    where: { userId_workspaceId: { userId: auth.userId, workspaceId: auth.workspace!.workspaceId } },
    update: parsed.data,
    create: { ...parsed.data, userId: auth.userId, workspaceId: auth.workspace!.workspaceId },
  });
  return NextResponse.json({ target });
}
