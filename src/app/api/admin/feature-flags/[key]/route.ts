import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/api-auth";
import {
  KNOWN_FEATURE_FLAGS,
  isKnownFeatureFlag,
} from "@/lib/feature-flags-keys";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ key: string }> };

/** A known flag that has no row yet reads as what the code assumes: off. */
function defaultFlag(key: string) {
  return {
    key,
    enabled: false,
    rolloutPercentage: 0,
    description: KNOWN_FEATURE_FLAGS[key] ?? null,
    overrides: [],
    persisted: false,
  };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { key } = await params;
  const flag = await prisma.featureFlag.findUnique({
    where: { key },
    include: { overrides: true },
  });
  if (flag) return NextResponse.json({ flag: { ...flag, persisted: true } });
  if (isKnownFeatureFlag(key)) {
    return NextResponse.json({ flag: defaultFlag(key) });
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { key } = await params;
  const body = ((await request.json().catch(() => null)) ?? {}) as {
    enabled?: unknown;
    rolloutPercentage?: unknown;
    userId?: unknown;
    userEnabled?: unknown;
  };
  const known = isKnownFeatureFlag(key);
  if (!known) {
    const exists = await prisma.featureFlag.findUnique({
      where: { key },
      select: { key: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }
  if (
    typeof body.userId === "string" &&
    typeof body.userEnabled === "boolean"
  ) {
    /* A known flag gets its row on the first write (off, 0%), so an override
       can be set before anybody seeded the flag. */
    if (known) {
      await prisma.featureFlag.upsert({
        where: { key },
        update: {},
        create: { key, description: KNOWN_FEATURE_FLAGS[key] },
      });
    }
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
  const rolloutPercentage =
    typeof body.rolloutPercentage === "number"
      ? Math.max(0, Math.min(100, Math.round(body.rolloutPercentage)))
      : undefined;
  const enabled = typeof body.enabled === "boolean" ? body.enabled : undefined;
  const flag = await prisma.featureFlag.upsert({
    where: { key },
    update: { enabled, rolloutPercentage },
    create: {
      key,
      description: KNOWN_FEATURE_FLAGS[key] ?? null,
      enabled: enabled ?? false,
      rolloutPercentage: rolloutPercentage ?? 0,
    },
  });
  return NextResponse.json({ flag });
}
