import { NextRequest, NextResponse } from "next/server";

import { adminActorId, recordAdminAudit } from "@/services/admin/audit";
import { KNOWN_FLAG_KEYS, clampRollout } from "@/services/admin/flags";
import { Prisma } from "@prisma/client";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requireAdmin } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "AdminFeatureFlagAPI";

type RouteContext = { params: Promise<{ key: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { key } = await params;
  const flag = await prisma.featureFlag.findUnique({
    where: { key },
    include: { overrides: true },
  });
  if (!flag) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ flag });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { key } = await params;
  const body = (await request.json().catch(() => null)) as {
    enabled?: unknown;
    rolloutPercentage?: unknown;
    userId?: unknown;
    userEnabled?: unknown;
  } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (
    typeof body.userId === "string" &&
    typeof body.userEnabled === "boolean"
  ) {
    const override = await prisma.featureFlagOverride.upsert({
      where: { flagKey_userId: { flagKey: key, userId: body.userId } },
      update: { enabled: body.userEnabled },
      create: {
        flagKey: key,
        userId: body.userId,
        enabled: body.userEnabled,
      },
    });
    return NextResponse.json({ override });
  }
  const enabled = typeof body.enabled === "boolean" ? body.enabled : undefined;
  const rolloutPercentage =
    typeof body.rolloutPercentage === "number" &&
    Number.isFinite(body.rolloutPercentage)
      ? clampRollout(body.rolloutPercentage)
      : undefined;
  if (enabled === undefined && rolloutPercentage === undefined) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }
  const data = { enabled, rolloutPercentage };
  try {
    // A flag the code reads but no migration created gets its row on the
    // first change; any other key must already exist.
    const flag = KNOWN_FLAG_KEYS.includes(key)
      ? await prisma.featureFlag.upsert({
          where: { key },
          update: data,
          create: {
            key,
            enabled: enabled ?? false,
            rolloutPercentage: rolloutPercentage ?? 0,
          },
        })
      : await prisma.featureFlag.update({ where: { key }, data });
    const actorId = await adminActorId(request);
    if (actorId) {
      await recordAdminAudit({
        actorId,
        action: "flag.update",
        details: {
          key,
          enabled: flag.enabled,
          rolloutPercentage: flag.rolloutPercentage,
        },
      });
    }
    await logger.info(
      "Feature flag changed",
      {
        key,
        enabled: flag.enabled,
        rolloutPercentage: flag.rolloutPercentage,
      },
      LOG_SOURCE
    );
    return NextResponse.json({ flag });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return routeErrorResponse(
      error,
      "Failed to change a feature flag",
      LOG_SOURCE,
      "Could not change the flag."
    );
  }
}
