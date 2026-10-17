import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";
import { sanitizeWorkScheduleInput } from "@/lib/work-schedules";
import { windowsToWeek } from "@/lib/work-week";
import { mirrorLegacyColumns } from "@/lib/work-week-server";

const LOG_SOURCE = "WorkScheduleAPI";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  try {
    const input = sanitizeWorkScheduleInput(await request.json());
    const existing = await prisma.workSchedule.findFirst({
      where: { id, userId: auth.userId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Schedule not found" },
        { status: 404 }
      );
    }

    const schedule = await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.workSchedule.updateMany({
          where: { userId: auth.userId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      await tx.workScheduleWindow.deleteMany({ where: { scheduleId: id } });
      const saved = await tx.workSchedule.update({
        where: { id },
        data: {
          name: input.name,
          timeZone: input.timeZone,
          isDefault: input.isDefault || existing.isDefault,
          windows: { create: input.windows },
        },
        include: { windows: true, _count: { select: { tasks: true } } },
      });
      // The default schedule also feeds the single-range columns.
      if (saved.isDefault) {
        await mirrorLegacyColumns(
          tx,
          auth.userId,
          windowsToWeek(saved.windows)
        );
      }
      return saved;
    });

    return NextResponse.json({ schedule });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update schedule";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const schedules = await prisma.workSchedule.findMany({
    where: { userId: auth.userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  const target = schedules.find((schedule) => schedule.id === id);
  if (!target) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }
  if (schedules.length === 1) {
    return NextResponse.json(
      { error: "Keep at least one schedule" },
      { status: 409 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.workSchedule.delete({ where: { id } });
    if (target.isDefault) {
      const replacement = schedules.find((schedule) => schedule.id !== id)!;
      await tx.workSchedule.update({
        where: { id: replacement.id },
        data: { isDefault: true },
      });
    }
  });
  return NextResponse.json({ success: true });
}
