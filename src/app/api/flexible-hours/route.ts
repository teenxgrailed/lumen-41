import { NextRequest, NextResponse } from "next/server";

import { FlexibleHoursOverrideKind } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "FlexibleHoursAPI";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const url = new URL(request.url);
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));
  const overrides = await prisma.flexibleHoursOverride.findMany({
    where: {
      userId: auth.userId,
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ overrides });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const date = parseDate(body.date);
  const kind = Object.values(FlexibleHoursOverrideKind).includes(
    body.kind as FlexibleHoursOverrideKind
  )
    ? (body.kind as FlexibleHoursOverrideKind)
    : null;
  const startTime =
    typeof body.startTime === "string" && TIME_PATTERN.test(body.startTime)
      ? body.startTime
      : null;
  const endTime =
    typeof body.endTime === "string" && TIME_PATTERN.test(body.endTime)
      ? body.endTime
      : null;

  if (
    !date ||
    !kind ||
    (kind === "START_LATER" && !startTime) ||
    (kind === "STOP_EARLY" && !endTime) ||
    (kind === "BLOCK_HOURS" && (!startTime || !endTime || startTime >= endTime))
  ) {
    return NextResponse.json(
      { error: "Invalid flexible-hours override" },
      { status: 400 }
    );
  }

  const override = await prisma.flexibleHoursOverride.create({
    data: {
      userId: auth.userId,
      date,
      kind,
      startTime,
      endTime,
    },
  });
  return NextResponse.json({ override }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const date = parseDate(new URL(request.url).searchParams.get("date"));
  if (!date) {
    return NextResponse.json({ error: "Date is required" }, { status: 400 });
  }
  const result = await prisma.flexibleHoursOverride.deleteMany({
    where: { userId: auth.userId, date },
  });
  return NextResponse.json({ reset: result.count });
}
